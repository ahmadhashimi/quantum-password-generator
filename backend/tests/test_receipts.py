import copy
import os

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.entropy.service import EntropyService
from app.main import create_app
from app.receipts import Signer, build_receipt, canonical, check_commitment, verify_signatures
from tests.conftest import FakeProvider

PROV = {"sources": ["lfd"], "quantum": True, "quantum_bytes": 64, "mixed_with": "os_csprng",
        "health": {"sp800_90b_style": "pass"}}


@pytest.fixture
def client():
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        yield c


def test_hybrid_signature_roundtrip_and_tamper_detection():
    s = Signer.generate()
    receipt, salt = build_receipt(s, "password", PROV, entropy_bits=129.4, secret_value="hunter2-but-better")
    keys = s.public_keys()
    assert verify_signatures(receipt["payload"], receipt["signatures"], keys) == {"ed25519": True, "ml-dsa-65": True}
    assert check_commitment(receipt["payload"], "hunter2-but-better", salt)
    assert not check_commitment(receipt["payload"], "wrong", salt)
    assert "hunter2" not in canonical(receipt["payload"]).decode()  # secret never in the receipt

    tampered = copy.deepcopy(receipt["payload"])
    tampered["provenance"]["quantum"] = False
    assert verify_signatures(tampered, receipt["signatures"], keys) == {"ed25519": False, "ml-dsa-65": False}


def test_one_broken_scheme_is_not_enough():
    s, other = Signer.generate(), Signer.generate()
    receipt, _ = build_receipt(s, "random", PROV, secret_value="ab")
    forged = dict(receipt["signatures"], **{"ml-dsa-65": other.sign(receipt["payload"])["ml-dsa-65"]})
    assert verify_signatures(receipt["payload"], forged, s.public_keys()) == {"ed25519": True, "ml-dsa-65": False}


def test_keys_persist_with_owner_only_permissions(tmp_path):
    path = tmp_path / "keys.json"
    a = Signer.load_or_create(str(path))
    assert (os.stat(path).st_mode & 0o777) == 0o600
    assert Signer.load_or_create(str(path)).public_keys() == a.public_keys()


def test_password_with_receipt_end_to_end(client):
    r = client.get("/api/v2/password", params={"length": 24, "receipt": True}).json()
    rid = r["receipt"]["payload"]["receipt_id"]
    assert r["password"] not in str(r["receipt"])
    stored = client.get(f"/api/v2/receipts/{rid}").json()
    assert stored == r["receipt"]  # the public log returns the exact receipt that was issued

    v = client.post("/api/v2/receipts/verify", json={"receipt_id": rid, "value": r["password"],
                                                     "salt": r["receipt_salt"]}).json()
    assert v["valid"] and v["in_public_log"] and v["commitment_matches"]
    assert v["signatures"] == {"ed25519": True, "ml-dsa-65": True}

    bad = client.post("/api/v2/receipts/verify", json={"receipt_id": rid, "value": "nope", "salt": r["receipt_salt"]})
    assert bad.json()["commitment_matches"] is False


def test_tampered_receipt_fails_verification(client):
    r = client.get("/api/v2/passphrase", params={"receipt": True}).json()
    receipt = r["receipt"]
    receipt["payload"]["entropy_bits"] = 999
    assert client.post("/api/v2/receipts/verify", json={"receipt": receipt}).json()["valid"] is False


def commit_and_run(client, entries, winners=3, title="Launch giveaway"):
    c = client.post("/api/v2/draws", json={"title": title, "entries": entries, "winners": winners})
    assert c.status_code == 200, c.text
    r = client.post(f"/api/v2/draws/{c.json()['draw_id']}/run")
    assert r.status_code == 200, r.text
    return c.json(), r.json()


def test_commit_then_run_draw(client):
    entries = [f"@user{i}" for i in range(50)]
    commit, run = commit_and_run(client, entries)
    assert commit["commit_receipt"]["payload"]["kind"] == "draw_commit"
    assert commit["commit_receipt"]["payload"]["provenance"]["sources"] == []  # no randomness at commit time
    winners = run["winners"]
    canonical_order = sorted(entries)  # indexes refer to the canonical (sorted) list anyone can rebuild
    assert len({w["index"] for w in winners}) == 3
    assert all(canonical_order[w["index"]] == w["entry"] for w in winners)
    payload = run["receipt"]["payload"]
    assert payload["details"]["commit_receipt_id"] == commit["commit_receipt"]["payload"]["receipt_id"]

    v = client.post("/api/v2/receipts/verify", json={"receipt_id": payload["receipt_id"], "entries": entries}).json()
    assert v["valid"] and v["entries_match"] and v["draw"]["status"] == "done"
    assert v["draw"]["draws_by_same_owner_over_same_entries"] == 1
    altered = client.post("/api/v2/receipts/verify", json={"receipt_id": payload["receipt_id"],
                                                           "entries": entries[:-1]}).json()
    assert altered["entries_match"] is False


def test_draw_runs_exactly_once(client):
    c = client.post("/api/v2/draws", json={"title": "t", "entries": ["a", "b", "c"], "winners": 1}).json()
    first = client.post(f"/api/v2/draws/{c['draw_id']}/run")
    again = client.post(f"/api/v2/draws/{c['draw_id']}/run")
    assert first.status_code == again.status_code == 200
    # A retry replays the stored outcome — same receipt, same winners, no fresh randomness.
    assert again.json()["replayed"] is True and again.headers["Idempotent-Replayed"] == "true"
    assert again.json()["receipt"] == first.json()["receipt"]


def test_rerolls_are_publicly_visible(client):
    entries = ["alice", "bob", "carol"]
    for _ in range(3):
        _, run = commit_and_run(client, entries, winners=1)
    v = client.post("/api/v2/receipts/verify", json={"receipt_id": run["receipt"]["payload"]["receipt_id"]}).json()
    assert v["draw"]["draws_by_same_owner_over_same_entries"] == 3


def test_entries_are_normalized_and_duplicates_rejected(client):
    dup = client.post("/api/v2/draws", json={"title": "t", "entries": ["Alice", "alice "], "winners": 1})
    assert dup.status_code == 422 and "Duplicate" in dup.text
    ctrl = client.post("/api/v2/draws", json={"title": "t", "entries": ["a\u0000b", "c"], "winners": 1})
    assert ctrl.status_code == 422
    # NFD input is stored as NFC, so a verifier pasting either form gets a match
    commit, run = commit_and_run(client, ["Jose\u0301", "zoe"], winners=1)
    v = client.post("/api/v2/receipts/verify", json={"receipt_id": run["receipt"]["payload"]["receipt_id"],
                                                     "entries": ["Jos\u00e9", " zoe "]}).json()
    assert v["entries_match"] is True


def test_draws_require_sign_in_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        assert c.post("/api/v2/draws", json={"title": "t", "entries": ["a"], "winners": 1}).status_code == 401
        assert c.post("/api/v2/draws/x/run").status_code == 401


@pytest.mark.parametrize("receipt", [
    {"payload": {}, "signatures": {"ed25519": 5}},
    {"payload": [], "signatures": {}},
    {"payload": {"key_id": ["x"]}, "signatures": {"ed25519": "!!", "ml-dsa-65": "@@"}},
    {"payload": {"commitment": 12345, "key_id": "nope"}, "signatures": {}},
])
def test_malformed_receipts_never_500(client, receipt):
    r = client.post("/api/v2/receipts/verify", json={"receipt": receipt, "value": "x", "salt": "%%%"})
    assert r.status_code in (200, 422)
    if r.status_code == 200:
        assert r.json()["valid"] is False and "commitment_matches" not in r.json()


def test_key_rotation_and_revocation():
    from app.receipts import Keyring, verify_receipt

    old, new = Signer.generate(), Signer.generate()
    receipt, _ = build_receipt(old, "random", PROV, secret_value="ab")
    retired = Keyring(new, [old.public_keys()])
    assert verify_receipt(receipt["payload"], receipt["signatures"], retired)["valid"]  # survives rotation
    assert verify_receipt(receipt["payload"], receipt["signatures"], Keyring(new))["reason"] == "unknown_key"
    revoked = Keyring(new, [{**old.public_keys(), "status": "revoked",
                             "revoked_at": receipt["payload"]["issued_at"] - 1}])
    assert verify_receipt(receipt["payload"], receipt["signatures"], revoked)["reason"] == "revoked_key"


def test_key_file_with_loose_permissions_is_refused(tmp_path):
    path = tmp_path / "keys.json"
    Signer.load_or_create(str(path))
    os.chmod(path, 0o644)
    with pytest.raises(PermissionError):
        Signer.load_or_create(str(path))


def test_public_keys_endpoint(client):
    k = client.get("/.well-known/quantumpass-keys.json").json()
    assert k["algorithms"] == ["ed25519", "ml-dsa-65"] and len(k["keys"][0]["key_id"]) == 16
    assert k["keys"][0]["status"] == "active"
    assert client.get("/api/v2/receipts/does-not-exist").status_code == 404


def test_draw_is_uniform():
    from collections import Counter

    from app.entropy.mixer import KeyStream, derive_key
    from app.generator import draw_winners

    s = KeyStream(derive_key(b"\x05" * 64, b"\x06" * 64))
    counts = Counter(draw_winners(s, ["a"] * 10, 1)[0] for _ in range(20_000))
    assert min(counts.values()) > 1800 and max(counts.values()) < 2200


def test_draw_title_cannot_carry_links_and_size_is_capped(client):
    phish = client.post("/api/v2/draws", json={"title": "You won! claim at evil.com", "entries": ["a"], "winners": 1})
    assert phish.status_code == 422
    big = client.post("/api/v2/draws", json={"title": "t", "entries": [f"{i}" + "x" * 190 for i in range(2000)],
                                             "winners": 1})
    assert big.status_code == 422
    assert client.post("/api/v2/draws", json={"title": "t", "entries": [str(i) for i in range(200)],
                                              "winners": 101}).status_code == 422


def test_shuffled_rerolls_are_still_counted(client):
    import random as _r
    entries = [f"p{i}" for i in range(20)]
    for _ in range(3):
        shuffled = entries[:]
        _r.shuffle(shuffled)
        _, run = commit_and_run(client, shuffled, winners=1)
    v = client.post("/api/v2/receipts/verify", json={"receipt_id": run["receipt"]["payload"]["receipt_id"]}).json()
    assert v["draw"]["draws_by_same_owner_over_same_entries"] == 3
    assert v["draw"]["draws_by_anyone_over_same_entries"] == 3
    assert v["draw"]["committed_seconds_before_run"] >= 0


def test_anonymous_receipts_expire():
    from datetime import timedelta

    from sqlmodel import Session

    from app import db
    db.init_db()
    s = Signer.generate()
    old, _ = build_receipt(s, "random", PROV, secret_value="x")
    mine, _ = build_receipt(s, "random", PROV, secret_value="y")
    db.save_receipt(old, None)
    db.save_receipt(mine, "user_1")
    with Session(db.engine()) as ses:
        for rid in (old["payload"]["receipt_id"], mine["payload"]["receipt_id"]):
            r = ses.get(db.Receipt, rid)
            r.created_at = db._now() - timedelta(days=40)
            ses.add(r)
        ses.commit()
    assert db.purge_anonymous_receipts() == 1
    assert db.get_receipt(mine["payload"]["receipt_id"]) is not None


def test_signatures_are_domain_separated():
    """A receipt signature must not verify as a plain signature over the bare payload (anti-stripping)."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    from app.receipts import unb64

    s = Signer.generate()
    receipt, _ = build_receipt(s, "random", PROV, secret_value="ab")
    pub = Ed25519PublicKey.from_public_bytes(unb64(s.public_keys()["ed25519"]))
    with pytest.raises(InvalidSignature):
        pub.verify(unb64(receipt["signatures"]["ed25519"]), canonical(receipt["payload"]))


def test_verify_material_is_byte_exact_including_python_floats(client):
    """Ported from the parallel feature/v2.1 branch: browsers can't rebuild `256.0` from JSON.parse output."""
    from app.receipts import SIGNING_DOMAIN, canonical, verify_signatures

    receipt = client.get("/api/v2/random", params={"bytes": 32, "receipt": True}).json()["receipt"]
    rid = receipt["payload"]["receipt_id"]
    m = client.get(f"/api/v2/receipts/{rid}/verify-material").json()
    assert m["canonical_payload"] == canonical(receipt["payload"]).decode()
    assert '"entropy_bits":256.0' in m["canonical_payload"]
    assert m["signing_domain"].encode() == SIGNING_DOMAIN
    assert all(verify_signatures(receipt["payload"], receipt["signatures"], m["public_key"]).values())
    assert "not an independent attestation" in m["trust"]
    assert client.get("/api/v2/receipts/../verify-material").status_code == 404
    assert client.get("/api/v2/receipts/AAAAAAAAAAAAAAAA/verify-material").status_code == 404
