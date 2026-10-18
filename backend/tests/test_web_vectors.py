"""The committed browser-verifier vectors (web/tests/vectors/receipts.json) also pass the Python offline verifier."""

import json
from pathlib import Path

import pytest

from app.receipts import canonical
from scripts import verify_receipt as v

VECTORS = Path(__file__).resolve().parents[2] / "web" / "tests" / "vectors" / "receipts.json"
DOC = json.loads(VECTORS.read_text()) if VECTORS.exists() else None
pytestmark = pytest.mark.skipif(DOC is None, reason="run `python -m scripts.make_web_vectors` first")


def _cases() -> list[dict]:
    return DOC["cases"] if DOC else []


@pytest.mark.parametrize("c", _cases(), ids=lambda c: c["name"])
def test_python_verifier_agrees(c):
    try:
        receipt, _ = v.unwrap(json.loads(c["text"]))  # Python's json keeps 256.0 as a float, so canonical holds
    except ValueError:
        assert c["valid"] is False  # e.g. not a receipt at all
        return
    if c["name"] == "duplicate key":
        # json.loads keeps the last duplicate; the browser rejects the document. Either way it must not verify.
        report = v.verify(receipt, DOC["keys"])
        assert report["valid"] is False
        return
    report = v.verify(receipt, DOC["keys"], c.get("value"), c.get("salt"), c.get("entries"))
    assert report["valid"] is c["valid"], report["checks"]
    if c["canonical"] and c["name"] not in ("float rewritten 256.0 -> 256",):
        assert canonical(receipt["payload"]).decode() == c["canonical"]


def test_revoked_and_mislabelled_key_sets_reject():
    receipt, _ = v.unwrap(json.loads(_cases()[0]["text"]))
    assert v.verify(receipt, DOC["revoked_keys"])["valid"] is False
    assert v.verify(receipt, DOC["mislabelled_keys"])["valid"] is False
