"""Generate cross-language receipt test vectors for the browser verifier (web/lib/verify).

    cd backend && python -m scripts.make_web_vectors

Writes web/tests/vectors/receipts.json: real receipts issued through the API by a throwaway signing key (only
public keys are written), plus tampered variants. Each case states whether it must verify. The Python offline
verifier checks the same file in tests/test_web_vectors.py, and vitest checks it in web/lib/verify, so the two
implementations can't drift apart.
"""

import copy
import json
import os
import sys
import tempfile
import time
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "web" / "tests" / "vectors" / "receipts.json"
ENTRIES = ["Zoë", "  alice ", "Émile", "🎉 party", "東京", "bob", "carol", "dave", "eve", "frank"]


def served(obj: object) -> str:
    """The JSON text FastAPI sends (compact, Python float formatting)."""
    return json.dumps(obj, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def main() -> None:
    tmp = tempfile.mkdtemp()
    os.environ.update(ENVIRONMENT="development", ALLOWED_HOSTS='["testserver"]',
                      DATABASE_URL=f"sqlite:///{tmp}/v.db", SIGNING_KEY_PATH=f"{tmp}/k.json")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
    from conftest import FakeProvider  # type: ignore[import-not-found]
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.entropy.service import EntropyService
    from app.main import create_app
    from app.receipts import Signer, canonical

    signer = Signer.generate()
    cases: list[dict[str, object]] = []

    def case(name: str, receipt: object, valid: bool, text: str | None = None, **opts: object) -> None:
        inner = receipt.get("receipt", receipt) if isinstance(receipt, dict) else None
        payload = inner.get("payload") if isinstance(inner, dict) else None
        cases.append({"name": name, "text": text if text is not None else served(receipt), "valid": valid,
                      "canonical": canonical(payload).decode() if isinstance(payload, dict) else None, **opts})

    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([FakeProvider("lfd")]),
                               signer=signer)) as c:
        keys = c.get("/.well-known/quantumpass-keys.json").json()
        pw = c.get("/api/v2/password?receipt=true&length=23").json()
        rnd = c.get("/api/v2/random?receipt=true&bytes=32").json()
        pp = c.get("/api/v2/passphrase?receipt=true&words=7").json()
        commit = c.post("/api/v2/draws", json={"title": "Lancement — 東京 🎉", "entries": ENTRIES, "winners": 3}).json()
        run = c.post(f"/api/v2/draws/{commit['draw_id']}/run").json()

    case("password with commitment", pw["receipt"], True, value=pw["password"], salt=pw["receipt_salt"])
    case("password, wrong value", pw["receipt"], False, value=pw["password"] + "x", salt=pw["receipt_salt"])
    case("random bytes (entropy_bits 256.0)", rnd["receipt"], True, value=rnd["hex"], salt=rnd["receipt_salt"])
    case("passphrase", pp["receipt"], True)
    case("draw commit, unicode entries", commit["commit_receipt"], True, entries=list(reversed(ENTRIES)))
    case("draw run response, winners recomputed", run, True, entries=ENTRIES)
    case("draw run, wrong entries", run, False, entries=ENTRIES[:-1])
    case("pretty-printed and reordered", rnd["receipt"], True,
         text=json.dumps({"signatures": rnd["receipt"]["signatures"], "payload": rnd["receipt"]["payload"]},
                         ensure_ascii=True, indent=2))

    t = copy.deepcopy(run["receipt"])
    t["payload"]["result"]["winners"][0]["entry"] = "mallory"
    case("winner edited", t, False)
    case("float rewritten 256.0 -> 256", rnd["receipt"], False,
         text=served(rnd["receipt"]).replace('"entropy_bits":256.0', '"entropy_bits":256'))
    case("duplicate key", rnd["receipt"], False,
         text=served(rnd["receipt"]).replace('"kind":"random"', '"kind":"random","kind":"password"'))
    t = copy.deepcopy(pw["receipt"])
    t["signatures"]["ml-dsa-65"] = t["signatures"]["ed25519"]
    case("ML-DSA signature swapped for Ed25519", t, False)

    # Re-signed with the real key but violating the schema: must still fail.
    t = copy.deepcopy(pw["receipt"])
    t["payload"]["evidence"]["quantum_evidence"] = "certified"
    t["signatures"] = signer.sign(t["payload"])
    case("validly signed, forbidden evidence claim", t, False)
    t = copy.deepcopy(run["receipt"])
    t["payload"]["result"]["selection"]["seed_hex"] = "0" * 128
    t["signatures"] = signer.sign(t["payload"])
    case("validly signed, seed does not produce winners", t, False, entries=ENTRIES)

    # A v1 receipt (pre-V2.1 format, no evidence block) still verifies.
    v1 = {"version": "qpg-receipt/1", "receipt_id": "v1receipt0000000", "issued_at": int(time.time()) - 3600,
          "kind": "password", "key_id": keys["keys"][0]["key_id"],
          "provenance": {"sources": ["anu"], "quantum": True, "quantum_bytes": 64, "mixed_with": "os_csprng",
                         "health": {"sp800_90b": "pass"}},
          "entropy_bits": 131.09, "commitment": "ab" * 64, "result": None, "details": {"length": 20}}
    case("v1 receipt", {"payload": v1, "signatures": signer.sign(v1)}, True)

    revoked = copy.deepcopy(keys)
    revoked["keys"][0].update(status="revoked", revoked_at=0)
    mislabelled = copy.deepcopy(keys)
    mislabelled["keys"][0]["ed25519"] = Signer.generate().public_keys()["ed25519"]
    doc = {"note": "Generated by backend/scripts/make_web_vectors.py with a throwaway key. Do not edit by hand.",
           "keys": keys, "revoked_keys": revoked, "mislabelled_keys": mislabelled,
           "draw": {"entries": ENTRIES, "winners": [w["index"] for w in run["receipt"]["payload"]["result"]["winners"]],
                    "seed_hex": run["receipt"]["payload"]["result"]["selection"]["seed_hex"]},
           "cases": cases}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
