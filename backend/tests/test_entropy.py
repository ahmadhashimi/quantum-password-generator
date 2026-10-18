import httpx
import pytest
import respx

from app.entropy.anu import ANUProvider
from app.entropy.base import EntropyError
from app.entropy.health import HealthMonitor, apt_cutoff, rct_cutoff
from app.entropy.ibm import IBMHarvester, bitstrings_to_bytes
from app.entropy.lfd import LfDProvider
from app.entropy.mixer import condition, derive_key
from app.entropy.pool import EntropyPool
from app.entropy.service import SEED_BYTES, EntropyService
from tests.conftest import FakeProvider

ANU = "https://api.quantumnumbers.anu.edu.au"
LFD = "https://lfdr.de/qrng_api/qrng"


# --- health tests (SP 800-90B) -------------------------------------------------------------------

def test_cutoffs_match_sp800_90b():
    assert rct_cutoff(8.0) == 4  # 1 + ceil(20/8)
    assert rct_cutoff(1.0) == 21
    assert apt_cutoff(1.0, window=1024) in range(580, 600)  # NIST table: 589 for H=1, W=1024 binary analogue
    assert 15 <= apt_cutoff(7.0) <= 20  # mean ≈ 4 matches in 511 samples; tail 2^-20 lands at ~17


def test_health_monitor_detects_stuck_source():
    m = HealthMonitor(7.0)
    assert m.check(bytes([0x42]) * 10) == "repetition_count"


def test_health_monitor_detects_bias():
    m = HealthMonitor(7.0)
    biased = bytes((0x00 if i % 3 == 0 else i % 256) for i in range(1, 600))
    assert m.check(biased) == "adaptive_proportion"


def test_health_monitor_passes_good_random():
    import os
    m = HealthMonitor(7.0)
    assert m.check(os.urandom(100_000)) is None


# --- providers -----------------------------------------------------------------------------------

@pytest.fixture
async def client():
    async with httpx.AsyncClient() as c:
        yield c


@respx.mock
async def test_anu_success(client):
    respx.get(ANU).respond(json={"success": True, "type": "uint8", "length": 4, "data": [1, 2, 3, 250]})
    p = ANUProvider(client, "key", ANU, 1)
    assert await p.fetch(4) == bytes([1, 2, 3, 250])
    assert respx.calls.last.request.headers["x-api-key"] == "key"


@respx.mock
@pytest.mark.parametrize("response", [
    httpx.Response(429, json={"message": "Limit Exceeded"}),
    httpx.Response(200, json={"success": False}),
    httpx.Response(200, json={"success": True, "data": [1, 2]}),
    httpx.Response(200, json={"success": True, "data": [1, 2, 3, 999]}),
    httpx.Response(200, text="not json"),
])
async def test_anu_rejects_bad_responses(client, response):
    respx.get(ANU).mock(return_value=response)
    with pytest.raises(EntropyError):
        await ANUProvider(client, "key", ANU, 1).fetch(4)


async def test_anu_requires_key(client):
    p = ANUProvider(client, None, ANU, 1)
    assert not p.configured
    with pytest.raises(EntropyError):
        await p.fetch(4)


@respx.mock
async def test_lfd_success_and_timeout(client):
    route = respx.get(LFD).respond(json={"qrn": "00ff10aa", "length": 4})
    assert await LfDProvider(client, LFD, 1).fetch(4) == bytes.fromhex("00ff10aa")
    route.side_effect = httpx.ConnectTimeout("boom")
    with pytest.raises(EntropyError):
        await LfDProvider(client, LFD, 1).fetch(4)


# --- service: fallback chain + provenance --------------------------------------------------------

async def test_service_uses_first_healthy_quantum_source():
    bad, good = FakeProvider("anu", error="quota"), FakeProvider("lfd")
    res = await EntropyService([bad, good]).get_stream()
    assert res.provenance.sources == ["lfd"] and res.provenance.quantum
    assert res.provenance.quantum_bytes == SEED_BYTES
    assert res.provenance.failures == {"anu": "quota"}


async def test_service_falls_back_to_os_and_says_so():
    res = await EntropyService([FakeProvider("anu", error="down")]).get_stream()
    assert res.provenance.sources == ["os_csprng"] and not res.provenance.quantum
    assert len(res.stream.read(32)) == 32


async def test_unhealthy_source_is_rejected():
    stuck = FakeProvider("anu", data=bytes(SEED_BYTES))
    res = await EntropyService([stuck, FakeProvider("lfd")]).get_stream()
    assert res.provenance.sources == ["lfd"]
    assert "health test failed" in res.provenance.failures["anu"]


async def test_circuit_breaker_stops_hammering_dead_provider():
    dead = FakeProvider("anu", error="down")
    svc = EntropyService([dead])
    for _ in range(6):
        await svc.get_stream()
    assert dead.calls == 3
    assert svc.status()["providers"][0]["available"] is False
    assert svc.status()["providers"][0]["state"] == "cooldown"


async def test_status_only_reports_quantum_after_real_success():
    svc = EntropyService([FakeProvider("lfd")])
    assert svc.status()["quantum_available"] is False  # untested
    await svc.get_stream()
    assert svc.status()["quantum_available"] is True


async def test_pool_bytes_are_used_once_and_combined():
    pool = EntropyPool()
    job_a = {"backend": "ibm_a", "job_id": "A", "mode": "hardware"}
    job_b = {"backend": "ibm_b", "job_id": "B", "mode": "hardware"}
    await pool.add(bytes(range(40)), job_a)
    await pool.add(bytes(range(216)), job_b)
    h = IBMHarvester(pool, "tok", None, None, 1, 1, 1)
    svc = EntropyService([FakeProvider("lfd")], h)
    r1 = await svc.get_stream("u1")
    assert r1.provenance.sources == ["ibm_quantum", "lfd"] and r1.provenance.quantum_bytes == 128
    assert r1.provenance.ibm_jobs == [job_a, job_b]  # exactly the jobs whose bytes were consumed
    assert len(pool) == 256 - SEED_BYTES
    r2 = await svc.get_stream("u1")
    assert r2.provenance.ibm_jobs == [job_b]
    anon = await svc.get_stream()  # anonymous callers never touch the scarce IBM pool
    assert "ibm_quantum" not in anon.provenance.sources


async def test_simulator_chunks_never_count_as_quantum():
    pool = EntropyPool()
    await pool.add(bytes(range(128)), {"backend": "aer", "job_id": "S", "mode": "simulator"})
    h = IBMHarvester(pool, "tok", None, None, 1, 1, 1)  # harvester now in hardware mode
    res = await EntropyService([], h).get_stream("u1")
    assert res.provenance.quantum is False and res.provenance.quantum_bytes == 0


def test_mixer_never_depends_on_quantum_alone():
    q = b"\x00" * 64  # worst case: an attacker controls the "quantum" input
    assert derive_key(q) != derive_key(q)  # os.urandom keeps every output unique


async def test_pool_persistence(tmp_path):
    path = tmp_path / "pool.bin"
    p = EntropyPool(str(path))
    meta = {"backend": "ibm_x", "job_id": "J", "mode": "hardware"}
    await p.add(b"x" * 100, meta)
    assert (path.stat().st_mode & 0o777) == 0o600
    reloaded = EntropyPool(str(path))
    assert len(reloaded) == 100
    assert await p.take(101) is None
    data, metas = await reloaded.take(40)
    assert len(data) == 40 and metas == [meta]


async def test_legacy_pool_file_without_metadata_is_discarded(tmp_path):
    path = tmp_path / "pool.bin"
    path.write_bytes(b"raw bytes from an old version")
    assert len(EntropyPool(str(path))) == 0


# --- IBM harvester (fake QPU results) ------------------------------------------------------------

def test_bitstrings_to_bytes():
    assert bitstrings_to_bytes(["1111", "0000", "1"]) == b"\xf0"


async def test_ibm_ingest_conditions_and_rejects_stuck_qubits():
    import secrets
    pool = EntropyPool()
    h = IBMHarvester(pool, "tok", None, None, 1, 1, 1)
    shots = ["".join(secrets.choice("01") for _ in range(127)) for _ in range(512)]
    n = await h.ingest(shots, "ibm_test", "job1")
    raw = len(bitstrings_to_bytes(shots))
    assert n == len(condition(bitstrings_to_bytes(shots))) and n <= raw // 4
    assert h.last_backend == "ibm_test" and len(pool) == n

    stuck = ["0" * 127] * 512
    assert await h.ingest(stuck, "ibm_test", "job2") == 0
    assert "health test failed" in h.last_error


async def test_ibm_daily_job_cap():
    h = IBMHarvester(EntropyPool(), "tok", None, None, 1, 1, 1, max_jobs_per_day=1)
    h._run_job = lambda: (["01" * 64] * 8, "fake", "j")
    await h.harvest_once()
    with pytest.raises(RuntimeError, match="cap"):
        await h.harvest_once()


def test_ibm_circuit_on_fake_backend():
    """Same transpile + SamplerV2 path as production, run locally on a noisy snapshot of a real IBM QPU."""
    pytest.importorskip("qiskit_aer")
    from qiskit_ibm_runtime.fake_provider import FakeManilaV2

    from app.entropy.ibm import sample_backend

    bitstrings, name, _ = sample_backend(FakeManilaV2(), shots=512)
    assert name == "fake_manila" and len(bitstrings) == 512 and all(len(b) == 5 for b in bitstrings)
    ones = sum(b.count("1") for b in bitstrings) / (512 * 5)
    assert 0.4 < ones < 0.6  # Hadamard superposition: each qubit ~50/50
    assert len(set(bitstrings)) > 25  # nearly all 32 outcomes appear


async def test_simulator_mode_end_to_end_is_never_labelled_quantum():
    """Full harvest -> pool -> password path on the Aer stabilizer simulator (127 qubits)."""
    pytest.importorskip("qiskit_aer")
    pool = EntropyPool()
    h = IBMHarvester(pool, None, None, None, 1024, 1, 1, simulator=True, sim_qubits=127)
    assert h.configured and h.name == "ibm_simulator" and not h.is_quantum
    n = await h.harvest_once()
    assert n > 0 and len(pool) == n and h.last_backend == "aer_simulator_stabilizer"

    res = await EntropyService([], h).get_stream("u1")
    assert res.provenance.sources == ["ibm_simulator"]
    assert res.provenance.quantum is False and res.provenance.quantum_bytes == 0
    assert res.provenance.ibm_jobs[0]["mode"] == "simulator"
    assert EntropyService([], h).status()["providers"][0]["mode"] == "simulator"


async def test_upstream_calls_are_throttled_and_batched():
    lfd = FakeProvider("lfd")
    svc = EntropyService([lfd], min_intervals={"lfd": 3600})
    results = [await svc.get_stream() for _ in range(20)]
    assert lfd.calls == 1  # one 1024-byte fetch serves 16 requests, then the interval blocks refetching
    assert sum(r.provenance.quantum for r in results) == 16


async def test_pool_quota_per_user():
    pool = EntropyPool()
    await pool.add(bytes(range(256)) * 10, {"backend": "b", "job_id": "J", "mode": "hardware"})
    svc = EntropyService([], IBMHarvester(pool, "tok", None, None, 1, 1, 1), pool_seeds_per_user_per_day=2)
    used = [("ibm_quantum" in (await svc.get_stream("u1")).provenance.sources) for _ in range(4)]
    assert used == [True, True, False, False]


def test_public_status_hides_errors():
    svc = EntropyService([FakeProvider("anu", error="crn:v1:secret-account boom")])
    import asyncio
    asyncio.run(svc.get_stream())
    public = svc.status()["providers"][0]
    assert public["error"] is True and "last_error" not in public
    assert "crn" in svc.status(detail=True)["providers"][0]["last_error"]


@respx.mock
async def test_quota_refusal_backs_off_for_an_hour(client):
    respx.get(LFD).respond(429, headers={"retry-after": "7200"})
    lfd = LfDProvider(client, LFD, 1)
    svc = EntropyService([lfd])
    await svc.get_stream()
    st = svc.status(detail=True)["providers"][0]
    assert st["state"] == "cooldown" and "429" in st["last_error"]


@respx.mock
async def test_local_pool_timeout_does_not_trip_breaker(client):
    respx.get(LFD).mock(side_effect=httpx.PoolTimeout("busy"))
    svc = EntropyService([LfDProvider(client, LFD, 1)])
    for _ in range(5):
        await svc.get_stream()
    assert svc.status(detail=True)["providers"][0]["state"] != "cooldown"


def test_ipv6_clients_share_a_64_bucket():
    from types import SimpleNamespace

    from app.ratelimit import rate_key
    req = lambda ip: SimpleNamespace(state=SimpleNamespace(), client=SimpleNamespace(host=ip),  # noqa: E731
                                     headers={}, scope={"type": "http"})
    assert rate_key(req("2001:db8:1:2::1")) == rate_key(req("2001:db8:1:2:ffff::9")) == "ip:2001:db8:1:2::/64"
    assert rate_key(req("203.0.113.7")) == "ip:203.0.113.7"
