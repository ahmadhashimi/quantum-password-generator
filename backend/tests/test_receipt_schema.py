"""Strict receipt schema, version handling, evidence classes and adversarial verification cases."""

import copy
import time

import pytest

from app.receipt_schema import validate_payload
from app.receipts import EVIDENCE, Keyring, Signer, b64, build_receipt, verify_receipt

PROV = {"sources": ["lfd"], "quantum": True, "quantum_bytes": 64, "mixed_with": "os_csprng",
        "health": {"sp800_90b_style": "pass"}}


@pytest.fixture
def signer():
    return Signer.generate()


def receipt(signer, **kw):
    r, _ = build_receipt(signer, kw.pop("kind", "password"), PROV, entropy_bits=kw.pop("bits", 128.0),
                         secret_value=kw.pop("secret", "s3cret"), details=kw.pop("details", {"length": 20}))
    return r


def test_new_receipts_are_v2_with_evidence(signer):
    p = receipt(signer)["payload"]
    assert p["version"] == "qpg-receipt/2" and p["evidence"] == EVIDENCE


def test_three_separate_verdicts(signer):
    r = receipt(signer)
    v = verify_receipt(r["payload"], r["signatures"], Keyring(signer))
    assert v["valid"] and v["integrity"]["valid"] and v["integrity"]["key_status"] == "active"
    assert v["provenance"]["type"] == "operator-asserted" and v["provenance"]["sources"] == ["lfd"]
    assert v["quantum_evidence"]["available"] is False


def test_v1_receipts_remain_verifiable(signer):
    """Receipts issued before V2.1 (no evidence block) still verify."""
    payload = {"version": "qpg-receipt/1", "receipt_id": "AAAAAAAAAAAAAAAA", "issued_at": int(time.time()) - 60,
               "kind": "password", "key_id": signer.public_keys()["key_id"], "provenance": PROV,
               "entropy_bits": 100.0, "commitment": "a" * 128, "result": None, "details": {"length": 16}}
    v = verify_receipt(payload, signer.sign(payload), Keyring(signer))
    assert v["valid"] and v["schema_valid"]


def _tamper(signer, mutate):
    r = receipt(signer)
    p = copy.deepcopy(r["payload"])
    mutate(p)
    return verify_receipt(p, signer.sign(p), Keyring(signer))  # even freshly re-signed by the real key


@pytest.mark.parametrize("mutate,reason", [
    (lambda p: p.update(version="qpg-receipt/9"), "unsupported_version"),
    (lambda p: p.update(kind="lottery"), "schema_invalid"),
    (lambda p: p.update(extra_field=1), "schema_invalid"),
    (lambda p: p["evidence"].update(quantum_evidence="certified"), "schema_invalid"),
    (lambda p: p.update(receipt_id="../../etc/passwd"), "schema_invalid"),
    (lambda p: p.update(key_id="ZZZZ"), "schema_invalid"),
    (lambda p: p.update(issued_at=int(time.time()) + 3600), "schema_invalid"),
    (lambda p: p.update(issued_at=True), "schema_invalid"),
    (lambda p: p.update(entropy_bits=10**30), "schema_invalid"),
    (lambda p: p.update(commitment=None), "schema_invalid"),
    (lambda p: p.update(result={"winners": [{"index": 0, "entry": "x"}]}), "schema_invalid"),
    (lambda p: p["provenance"].update(quantum="yes"), "schema_invalid"),
    (lambda p: p["provenance"].update(sources=["x" * 64]), "schema_invalid"),
    (lambda p: p.update(details={"length": "20"}), "schema_invalid"),
])
def test_schema_violations_fail_even_with_valid_signatures(signer, mutate, reason):
    v = _tamper(signer, mutate)
    assert v["valid"] is False and v["reason"] == reason


def test_unknown_but_wellformed_key_id(signer):
    other = Signer.generate()
    r = receipt(other)
    v = verify_receipt(r["payload"], r["signatures"], Keyring(signer))
    assert v["reason"] == "unknown_key" and v["valid"] is False


def test_signatures_swapped_between_receipts(signer):
    a, b = receipt(signer), receipt(signer, secret="other")
    v = verify_receipt(a["payload"], b["signatures"], Keyring(signer))
    assert v["reason"] == "bad_signature"


def test_mixed_signatures_one_valid_one_foreign(signer):
    a = receipt(signer)
    forged = dict(a["signatures"], **{"ml-dsa-65": Signer.generate().sign(a["payload"])["ml-dsa-65"]})
    v = verify_receipt(a["payload"], forged, Keyring(signer))
    assert v["valid"] is False and v["signatures"] == {"ed25519": True, "ml-dsa-65": False}


@pytest.mark.parametrize("sigs", [{}, {"ed25519": "!!!"}, {"ed25519": "", "ml-dsa-65": ""}, {"ed25519": 5},
                                  {"ed25519": "A" * 8000, "ml-dsa-65": "B" * 8000}])
def test_garbage_signatures(signer, sigs):
    r = receipt(signer)
    v = verify_receipt(r["payload"], sigs, Keyring(signer))
    assert v["valid"] is False


@pytest.mark.parametrize("payload", [None, [], "x", 5, {}, {"version": None}, {"version": ["qpg-receipt/2"]}])
def test_non_object_payloads(payload):
    ok, err = validate_payload(payload)
    assert not ok and err


def test_nan_cannot_be_signed(signer):
    with pytest.raises(ValueError):
        build_receipt(signer, "random", PROV, entropy_bits=float("nan"), secret_value="x", details={"bytes": 4})


def test_builder_refuses_invalid_payloads(signer):
    with pytest.raises(ValueError):
        build_receipt(signer, "password", PROV, secret_value=None, details={"length": 5})  # no commitment


def test_retired_key_with_wrong_key_id_is_refused(signer):
    old = Signer.generate().public_keys()
    with pytest.raises(ValueError, match="key_id"):
        Keyring(signer, [{**old, "key_id": "0" * 16}])
    with pytest.raises(ValueError):
        Keyring(signer, [{**old, "status": "revoked"}])  # revoked needs revoked_at
    with pytest.raises(ValueError):
        Keyring(signer, [{**old, "ed25519": b64(b"short")}])


def test_verify_endpoint_never_500s_on_hostile_details():
    """Regression: a non-dict `details` combined with `entries` used to raise AttributeError (500)."""
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.entropy.service import EntropyService
    from app.main import create_app
    from tests.conftest import FakeProvider

    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        for details in ("string", ["list"], 5, None):
            r = c.post("/api/v2/receipts/verify", json={
                "receipt": {"payload": {"version": "qpg-receipt/2", "kind": "draw", "details": details},
                            "signatures": {}}, "entries": ["a"]})
            assert r.status_code in (200, 422) and (r.status_code == 422 or r.json()["valid"] is False)


def test_selection_tampering_is_detected():
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.entropy.service import EntropyService
    from app.main import create_app
    from tests.conftest import FakeProvider

    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]))) as c:
        entries = [f"e{i}" for i in range(20)]
        d = c.post("/api/v2/draws", json={"title": "t", "entries": entries, "winners": 2}).json()
        run = c.post(f"/api/v2/draws/{d['draw_id']}/run").json()
        bad = copy.deepcopy(run["receipt"])
        bad["payload"]["result"]["selection"]["seed_hex"] = "0" * 128
        v = c.post("/api/v2/receipts/verify", json={"receipt": bad, "entries": entries}).json()
        assert v["valid"] is False and v["reason"] == "bad_signature"  # can't change the seed without the key
