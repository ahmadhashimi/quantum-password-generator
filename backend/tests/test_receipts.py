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
        "health": {"sp800_90b": "pass"}}


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
    assert stored == {"payload": r["receipt"]["payload"], "signatures": r["receipt"]["signatures"]}

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


def test_provably_fair_draw(client):
    entries = [f"@user{i}" for i in range(50)]
    r = client.post("/api/v2/draw", json={"title": "Launch giveaway", "entries": entries, "winners": 3}).json()
    winners = r["winners"]
    assert len({w["index"] for w in winners}) == 3 and all(entries[w["index"]] == w["entry"] for w in winners)
    rid = r["receipt"]["payload"]["receipt_id"]
    v = client.post("/api/v2/receipts/verify", json={"receipt_id": rid, "entries": entries}).json()
    assert v["valid"] and v["entries_match"]
    altered = client.post("/api/v2/receipts/verify", json={"receipt_id": rid, "entries": entries[:-1]}).json()
    assert altered["entries_match"] is False


@pytest.mark.parametrize("body", [
    {"title": "x", "entries": ["a"], "winners": 2},
    {"title": "x", "entries": [], "winners": 1},
    {"title": "", "entries": ["a"], "winners": 1},
])
def test_draw_validation(client, body):
    assert client.post("/api/v2/draw", json=body).status_code == 422


def test_public_keys_endpoint(client):
    k = client.get("/.well-known/quantumpass-keys.json").json()
    assert k["algorithms"] == ["ed25519", "ml-dsa-65"] and len(k["keys"][0]["key_id"]) == 16
    assert client.get("/api/v2/receipts/does-not-exist").status_code == 404


def test_draw_is_uniform():
    from collections import Counter

    from app.entropy.mixer import KeyStream, derive_key
    from app.generator import draw_winners

    s = KeyStream(derive_key(b"\x05" * 64, b"\x06" * 64))
    counts = Counter(draw_winners(s, ["a"] * 10, 1)[0] for _ in range(20_000))
    assert min(counts.values()) > 1800 and max(counts.values()) < 2200
