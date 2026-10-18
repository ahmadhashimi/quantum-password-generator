"""Verify a QuantumPass receipt offline — no trust in our server required.

    python -m scripts.verify_receipt receipt.json keys.json [--value SECRET --salt SALT] [--entries entries.json]

`keys.json` is the public key set from /.well-known/quantumpass-keys.json. The receipt is valid only if
BOTH the Ed25519 and the ML-DSA-65 (post-quantum) signatures verify over the canonical payload.
"""

import argparse
import json
import sys

from app.api.receipts import entries_hash
from app.receipts import check_commitment, verify_signatures


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("receipt")
    ap.add_argument("keys")
    ap.add_argument("--value")
    ap.add_argument("--salt")
    ap.add_argument("--entries")
    a = ap.parse_args()

    receipt = json.load(open(a.receipt))
    keyset = json.load(open(a.keys))
    key = next((k for k in keyset["keys"] if k["key_id"] == receipt["payload"]["key_id"]), None)
    if key is None:
        print("FAIL: receipt was signed with an unknown key")
        return 1
    sigs = verify_signatures(receipt["payload"], receipt["signatures"], key)
    ok = all(sigs.values())
    print(f"Ed25519: {'ok' if sigs['ed25519'] else 'FAIL'}   ML-DSA-65: {'ok' if sigs['ml-dsa-65'] else 'FAIL'}")
    if a.value is not None and a.salt:
        match = check_commitment(receipt["payload"], a.value, a.salt)
        print(f"Commitment matches value: {match}")
        ok &= match
    if a.entries:
        published = (receipt["payload"].get("result") or {}).get("entries_sha256")
        match = published == entries_hash(json.load(open(a.entries)))
        print(f"Entries list matches: {match}")
        ok &= match
    p = receipt["payload"]["provenance"]
    print(f"Sources: {', '.join(p['sources'])}  quantum={p['quantum']}  ibm_job={p.get('ibm_job')}")
    print("VALID" if ok else "INVALID")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
