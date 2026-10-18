"""Entropy service: gathers quantum bytes from the configured sources and mixes them with the OS CSPRNG.

Per request we draw a 64-byte (512-bit) quantum seed — from the IBM pool if stocked, plus one live QRNG
(ANU, then LfD) — health-test it, and derive a keystream with HKDF + HMAC-SHA512. Provenance records
exactly which sources contributed so the UI never claims quantum when it fell back.
"""

import asyncio
import time
from dataclasses import dataclass, field

import httpx

from ..config import Settings
from .anu import ANUProvider
from .base import EntropyError, EntropyProvider
from .health import HealthMonitor
from .ibm import IBMHarvester
from .lfd import LfDProvider
from .mixer import KeyStream, derive_key
from .pool import EntropyPool

SEED_BYTES = 64
FETCH_BYTES = 1024  # one upstream call buffers 16 seeds
# ANU and LfD publish post-processed, full-entropy output; assess at 7 bits/byte to leave margin.
LIVE_MIN_ENTROPY = 7.0
BREAKER_THRESHOLD = 3
BREAKER_COOLDOWN_S = 60.0


@dataclass
class Provenance:
    sources: list[str]
    quantum: bool
    quantum_bytes: int
    failures: dict[str, str] = field(default_factory=dict)
    ibm_jobs: list[dict] | None = None
    timestamp: float = field(default_factory=time.time)

    def as_dict(self) -> dict:
        d = {
            "sources": self.sources,
            "quantum": self.quantum,
            "quantum_bytes": self.quantum_bytes,
            "mixed_with": "os_csprng",
            "failures": self.failures,
            # Every contributing source passed SP 800-90B RCT + APT; failing sources are excluded above.
            "health": {"sp800_90b": "pass" if self.sources != ["os_csprng"] else "n/a"},
            "timestamp": self.timestamp,
        }
        if self.ibm_jobs:
            d["ibm_jobs"] = self.ibm_jobs
        return d


@dataclass
class EntropyResult:
    stream: KeyStream
    provenance: Provenance


@dataclass
class _ProviderState:
    provider: EntropyProvider
    monitor: HealthMonitor
    consecutive_failures: int = 0
    open_until: float = 0.0
    successes: int = 0
    last_error: str | None = None
    last_success_at: float | None = None
    min_interval_s: float = 0.0  # minimum gap between upstream calls (protects paid quotas / free services)
    buffer: bytearray = field(default_factory=bytearray)
    last_fetch: float = float("-inf")
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def take(self, n: int) -> bytes | None:
        if len(self.buffer) < n:
            return None
        out = bytes(self.buffer[:n])
        del self.buffer[:n]
        return out

    @property
    def usable(self) -> bool:
        """Worth trying now (configured and circuit breaker closed)."""
        return self.provider.configured and time.monotonic() >= self.open_until

    @property
    def state(self) -> str:
        if not self.provider.configured:
            return "not_configured"
        if not self.usable:
            return "cooldown"
        if self.consecutive_failures:
            return "failing"
        return "ok" if self.successes else "untested"

    def record_failure(self, reason: str, cooldown_s: float | None = None) -> None:
        self.consecutive_failures += 1
        self.last_error = reason
        if cooldown_s:  # auth/quota refusal: retrying soon only burns quota and annoys the provider
            self.open_until = time.monotonic() + cooldown_s
        elif self.consecutive_failures >= BREAKER_THRESHOLD:
            self.open_until = time.monotonic() + BREAKER_COOLDOWN_S

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.successes += 1
        self.last_success_at = time.time()


class EntropyService:
    def __init__(self, live: list[EntropyProvider], harvester: IBMHarvester | None = None,
                 min_intervals: dict[str, float] | None = None, pool_seeds_per_user_per_day: int = 20):
        intervals = min_intervals or {}
        self._live = [_ProviderState(p, HealthMonitor(LIVE_MIN_ENTROPY), min_interval_s=intervals.get(p.name, 0.0))
                      for p in live]
        self.harvester = harvester
        self._pool_quota = pool_seeds_per_user_per_day
        self._pool_used: dict[tuple[str, str], int] = {}

    @classmethod
    def from_settings(cls, s: Settings, client: httpx.AsyncClient) -> "EntropyService":
        live = [
            ANUProvider(client, s.anu_api_key, s.anu_api_url, s.provider_timeout_s),
            LfDProvider(client, s.lfd_api_url, s.provider_timeout_s),
        ]
        harvester = IBMHarvester(
            EntropyPool(s.pool_path), s.ibm_quantum_token, s.ibm_quantum_instance, s.ibm_backend,
            s.ibm_shots, s.ibm_harvest_interval_s, s.ibm_pool_min_bytes, s.ibm_max_jobs_per_day,
            simulator=s.ibm_mode == "simulator", sim_qubits=s.ibm_sim_qubits,
        )
        return cls(live, harvester, {"anu": s.anu_min_interval_s, "lfd": s.lfd_min_interval_s},
                   s.pool_seeds_per_user_per_day)

    async def _refill(self, st: _ProviderState, failures: dict[str, str]) -> None:
        """Fetch a batch upstream, at most once per min_interval_s per provider, and health-test it."""
        async with st.lock:
            if len(st.buffer) >= SEED_BYTES or time.monotonic() - st.last_fetch < st.min_interval_s:
                return
            st.last_fetch = time.monotonic()
            try:
                data = await st.provider.fetch(FETCH_BYTES)
            except EntropyError as e:
                failures[st.provider.name] = str(e)
                if not e.transient:
                    st.record_failure(str(e), e.cooldown_s)
                return
            if reason := st.monitor.check(data):
                st.record_failure(f"health test failed: {reason}")
                failures[st.provider.name] = f"health test failed: {reason}"
                return
            st.record_success()
            st.buffer.extend(data)

    async def _from_live(self, failures: dict[str, str]) -> tuple[str, bytes] | None:
        for st in self._live:
            if not st.usable:
                continue
            if len(st.buffer) < SEED_BYTES:
                await self._refill(st, failures)
            if data := st.take(SEED_BYTES):
                return st.provider.name, data
        return None

    def _pool_allowed(self, user_id: str | None) -> bool:
        """The IBM pool is scarce (one QPU job ≈ 127 seeds): signed-in users only, with a daily quota each."""
        if user_id is None or self.harvester is None:
            return False
        key = (time.strftime("%Y-%m-%d", time.gmtime()), user_id)
        if self._pool_used.get(key, 0) >= self._pool_quota:
            return False
        if len(self._pool_used) > 100_000:
            self._pool_used.clear()
        self._pool_used[key] = self._pool_used.get(key, 0) + 1
        return True

    async def _from_pool(self, user_id: str | None) -> tuple[bytes, list[dict]] | None:
        if not self._pool_allowed(user_id):
            return None
        return await self.harvester.pool.take(SEED_BYTES)

    async def get_stream(self, user_id: str | None = None, use_pool: bool = True) -> EntropyResult:
        failures: dict[str, str] = {}
        pooled, live = await asyncio.gather(self._from_pool(user_id if use_pool else None),
                                            self._from_live(failures))
        sources: list[str] = []
        extra = b""  # everything mixed in on top of os.urandom
        quantum_bytes = 0
        ibm_jobs = None
        if pooled and self.harvester:
            data, ibm_jobs = pooled
            sources.append(self.harvester.name)
            extra += data
            # Count only bytes from real hardware chunks, judged per chunk rather than by the current mode.
            if all(m.get("mode") == "hardware" for m in ibm_jobs):
                quantum_bytes += len(data)
        if live:
            sources.append(live[0])
            extra += live[1]
            quantum_bytes += len(live[1])
        prov = Provenance(sources=sources or ["os_csprng"], quantum=quantum_bytes > 0, quantum_bytes=quantum_bytes,
                          failures=failures, ibm_jobs=ibm_jobs)
        return EntropyResult(KeyStream(derive_key(extra)), prov)

    def status(self, detail: bool = False) -> dict:
        """Public view hides raw errors and job ids (they can leak account details); admins get everything."""
        full = self._status()
        if detail:
            return full
        keep = ("name", "quantum", "configured", "available", "state", "mode", "pool_bytes")
        return {**full, "providers": [{k: p[k] for k in keep if k in p} | {"error": bool(p.get("last_error"))}
                                      for p in full["providers"]]}

    def _status(self) -> dict:
        providers = [
            {
                "name": st.provider.name,
                "quantum": st.provider.is_quantum,
                "configured": st.provider.configured,
                "available": st.state == "ok",
                "state": st.state,
                "successes": st.successes,
                "last_error": st.last_error,
                "last_success_at": st.last_success_at,
                "health": {"rct_cutoff": st.monitor.rct_c, "apt_cutoff": st.monitor.apt_c,
                           "samples": st.monitor.samples, "failures": st.monitor.failures},
            }
            for st in self._live
        ]
        if self.harvester:
            h = self.harvester
            providers.insert(0, {
                "name": h.name,
                "quantum": h.is_quantum,
                "mode": "simulator" if h.simulator else "hardware",
                "configured": h.configured,
                "available": len(h.pool) >= SEED_BYTES,
                "pool_bytes": len(h.pool),
                "total_harvested": h.pool.total_harvested,
                "last_backend": h.last_backend,
                "last_job_id": h.last_job_id,
                "last_harvest_at": h.last_harvest_at,
                "last_error": h.last_error,
                "jobs_last_24h": h.jobs_last_24h,
                "health": {"rct_cutoff": h.monitor.rct_c, "apt_cutoff": h.monitor.apt_c,
                           "samples": h.monitor.samples, "failures": h.monitor.failures},
            })
        quantum_ready = any(p["available"] and p["quantum"] for p in providers)
        return {"quantum_available": quantum_ready, "fallback": "os_csprng", "providers": providers}
