"""Verify a QuantumPass receipt offline: no QuantumPass code and no trust in the issuing server.

    python verify_receipt.py receipt.json keys.json [--value SECRET --salt SALT] [--entries entries.json] [--json]

Needs only Python 3.12+ and the `cryptography` package (`pip install cryptography`); it deliberately does not
import the QuantumPass backend, so it is an independent implementation of the published verification algorithm
(docs/EVIDENCE_API.md). Our test suite checks it against the server on every change.

- receipt.json: a receipt {"payload", "signatures"}, a draw response {"receipt": {...}}, or an evidence export.
- keys.json: the public key set from https://<host>/.well-known/quantumpass-keys.json, fetched yourself. Keys
  bundled in an evidence export are used only if you pass no keys file, with a warning, because whoever gave
  you the export could have chosen them.

Checks, in order: receipt version and structure; the signing key is published, correctly labelled and not
revoked for this receipt's issue time; BOTH the Ed25519 and the ML-DSA-65 signatures verify over the
domain-separated canonical payload; optionally the commitment opens to your secret; optionally the published
entry list matches the receipt; for v2 draws, the winners are recomputed from the published selection seed.

Exit status: 0 valid, 1 invalid, 2 usage or input error.
"""

import argparse
import base64
import hashlib
import hmac
import json
import re
import sys
import time
import unicodedata

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.mldsa import MLDSA65PublicKey

SIGNING_DOMAIN = b"QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\x00"
VERSIONS = ("qpg-receipt/1", "qpg-receipt/2")
KINDS = ("password", "passphrase", "random", "draw_commit", "draw")
SECRET_KINDS = ("password", "passphrase", "random")
EVIDENCE_V2 = {"integrity": "hybrid-signature:ed25519+ml-dsa-65", "provenance": "operator-asserted",
               "quantum_evidence": "none"}
RECEIPT_ID = re.compile(r"^[A-Za-z0-9_-]{16}$")
KEY_ID = re.compile(r"^[0-9a-f]{16}$")
HEX128 = re.compile(r"^[0-9a-f]{128}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
LINE_BREAKS = {"\u2028", "\u2029", "\x85"}
CLOCK_SKEW_S = 300


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


# --- structure -------------------------------------------------------------------------------------------------

def _int(v: object) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def structure_errors(p: object) -> list[str]:
    """The subset of the receipt schema an offline verifier needs. The server enforces the full schema."""
    if not isinstance(p, dict):
        return ["payload is not an object"]
    errs = []
    if p.get("version") not in VERSIONS:
        return [f"unsupported version {p.get('version')!r}"]
    required = {"version", "receipt_id", "issued_at", "kind", "key_id", "provenance", "entropy_bits", "commitment",
                "result", "details"} | ({"evidence"} if p["version"] == "qpg-receipt/2" else set())
    if missing := required - p.keys():
        errs.append(f"missing fields: {sorted(missing)}")
    if extra := p.keys() - required:
        errs.append(f"unexpected fields: {sorted(extra)}")
    if p.get("kind") not in KINDS:
        errs.append(f"unknown kind {p.get('kind')!r}")
    if not isinstance(p.get("receipt_id"), str) or not RECEIPT_ID.match(p["receipt_id"]):
        errs.append("malformed receipt_id")
    if not isinstance(p.get("key_id"), str) or not KEY_ID.match(p["key_id"]):
        errs.append("malformed key_id")
    if not _int(p.get("issued_at")) or p["issued_at"] > time.time() + CLOCK_SKEW_S:
        errs.append("issued_at is not a past unix time")
    if p["version"] == "qpg-receipt/2" and p.get("evidence") != EVIDENCE_V2:
        errs.append("evidence block does not match qpg-receipt/2")
    if not isinstance(p.get("details"), dict):
        errs.append("details is not an object")
        return errs
    kind, commitment, result = p.get("kind"), p.get("commitment"), p.get("result")
    if kind in SECRET_KINDS and (not isinstance(commitment, str) or not HEX128.match(commitment) or result is not None):
        errs.append("secret receipts carry a 128-hex commitment and no result")
    if kind == "draw_commit" and (commitment is not None or result is not None):
        errs.append("draw_commit receipts carry neither a commitment nor a result")
    if kind == "draw":
        if commitment is not None or not isinstance(result, dict) or not isinstance(result.get("winners"), list):
            errs.append("draw receipts carry a public result and no commitment")
        elif p["version"] == "qpg-receipt/2":
            sel = result.get("selection")
            if not isinstance(sel, dict) or sel.get("algorithm") != "qpg-select/1" or \
                    not isinstance(sel.get("seed_hex"), str) or not HEX128.match(sel["seed_hex"]):
                errs.append("v2 draw receipts publish a qpg-select/1 selection seed")
    if kind in ("draw_commit", "draw"):
        sha = p["details"].get("entries_sha256")
        if not isinstance(sha, str) or not HEX64.match(sha):
            errs.append("draw receipts carry details.entries_sha256")
    return errs


# --- keys and signatures ---------------------------------------------------------------------------------------

def find_key(keyset: dict, key_id: str) -> tuple[dict | None, str | None]:
    for k in keyset.get("keys", []):
        if isinstance(k, dict) and k.get("key_id") == key_id:
            try:
                ed, ml = unb64(k["ed25519"]), unb64(k["ml-dsa-65"])
            except (KeyError, TypeError, ValueError):
                return None, "published key is malformed"
            if hashlib.sha256(ed + ml).hexdigest()[:16] != key_id:
                return None, "published key does not match its key_id (mislabelled key set)"
            return k, None
    return None, "receipt was signed with a key that is not in the key set"


def verify_signatures(payload: dict, signatures: object, key: dict) -> dict[str, bool]:
    results = {"ed25519": False, "ml-dsa-65": False}
    if not isinstance(signatures, dict):
        return results
    msg = SIGNING_DOMAIN + canonical(payload)
    for alg, load in (("ed25519", Ed25519PublicKey.from_public_bytes),
                      ("ml-dsa-65", MLDSA65PublicKey.from_public_bytes)):
        try:
            load(unb64(key[alg])).verify(unb64(signatures[alg]), msg)
            results[alg] = True
        except (InvalidSignature, KeyError, TypeError, ValueError):
            pass
    return results


# --- commitments, entries and selection ------------------------------------------------------------------------

def check_commitment(payload: dict, value: str, salt_b64: str) -> bool:
    try:
        salt = unb64(salt_b64)
    except (TypeError, ValueError):
        return False
    expected = payload.get("commitment")
    got = hashlib.sha512(salt + value.encode()).hexdigest()
    return isinstance(expected, str) and len(salt) == 32 and hmac.compare_digest(expected, got)


def normalize_entries(raw: list[str]) -> list[str]:
    """NFC-normalise, trim, reject control characters and case-insensitive duplicates, sort."""
    entries = []
    for e in raw:
        e = unicodedata.normalize("NFC", e).strip()
        if not e or len(e) > 200 or any(unicodedata.category(c).startswith("C") or c in LINE_BREAKS for c in e):
            raise ValueError(f"invalid entry {e!r}")
        entries.append(e)
    if len({e.casefold() for e in entries}) != len(entries):
        raise ValueError("duplicate entries")
    return sorted(entries)


def entries_hash(entries: list[str]) -> str:
    return hashlib.sha256(json.dumps(entries, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


class KeyStream:
    """HMAC-SHA512(seed, counter as 8-byte big-endian) blocks, consumed in order."""

    def __init__(self, seed: bytes):
        self.seed, self.counter, self.buf = seed, 0, b""

    def read(self, n: int) -> bytes:
        while len(self.buf) < n:
            self.buf += hmac.new(self.seed, self.counter.to_bytes(8, "big"), hashlib.sha512).digest()
            self.counter += 1
        out, self.buf = self.buf[:n], self.buf[n:]
        return out


def uniform_index(stream: KeyStream, n: int) -> int:
    nbytes = 1 if n <= 256 else 2
    space = 1 << (8 * nbytes)
    limit = space - space % n
    while True:
        v = int.from_bytes(stream.read(nbytes), "big")
        if v < limit:
            return v % n


def select_winners(seed: bytes, n_entries: int, winners: int) -> list[int]:
    """qpg-select/1: partial Fisher-Yates over indexes of the sorted, normalised entry list."""
    stream, idx = KeyStream(seed), list(range(n_entries))
    for i in range(winners):
        j = i + uniform_index(stream, n_entries - i)
        idx[i], idx[j] = idx[j], idx[i]
    return idx[:winners]


# --- driver ----------------------------------------------------------------------------------------------------

def unwrap(doc: dict) -> tuple[dict, dict | None]:
    """Accept a bare receipt, an API response with "receipt", or an evidence export with "keys"."""
    receipt = doc.get("receipt", doc) if isinstance(doc, dict) else doc
    keys = doc.get("keys") if isinstance(doc, dict) and isinstance(doc.get("keys"), dict) else None
    if not isinstance(receipt, dict) or "payload" not in receipt:
        raise ValueError("no receipt found (expected {\"payload\", \"signatures\"})")
    return receipt, keys


def verify(receipt: dict, keyset: dict, value: str | None = None, salt: str | None = None,
           entries: list[str] | None = None) -> dict:
    p, report = receipt.get("payload"), {"checks": [], "valid": False}

    def check(name: str, ok: bool, detail: str = "") -> bool:
        report["checks"].append({"check": name, "ok": ok, **({"detail": detail} if detail else {})})
        return ok

    errs = structure_errors(p)
    if not check("structure", not errs, "; ".join(errs)):
        return report
    assert isinstance(p, dict)
    key, why = find_key(keyset, p["key_id"])
    if not check("key published", key is not None, why or p["key_id"]):
        return report
    assert key is not None
    revoked = key.get("status") == "revoked" and p["issued_at"] >= key.get("revoked_at", 0)
    if not check("key not revoked", not revoked, f"revoked at {key.get('revoked_at')}" if revoked else
                 key.get("status", "active")):
        return report
    sigs = verify_signatures(p, receipt.get("signatures"), key)
    ok = check("Ed25519 signature", sigs["ed25519"]) & check("ML-DSA-65 signature", sigs["ml-dsa-65"])
    if value is not None and salt is not None:
        ok &= check("commitment opens to your value", check_commitment(p, value, salt))
    if entries is not None and p["kind"] in ("draw_commit", "draw"):
        try:
            canon = normalize_entries(entries)
        except ValueError as e:
            ok &= check("entries match", False, str(e))
        else:
            ok &= check("entries match", entries_hash(canon) == p["details"]["entries_sha256"])
            sel = (p.get("result") or {}).get("selection")
            if ok and sel:
                n = len(p["result"]["winners"])
                picked = select_winners(bytes.fromhex(sel["seed_hex"]), len(canon), n)
                expected = [{"index": i, "entry": canon[i]} for i in picked]
                ok &= check("winners recomputed from selection seed", expected == p["result"]["winners"])
    report["valid"] = bool(ok)
    report["provenance"] = {"type": "operator-asserted (reported by the server; not proven by the signature)",
                            **p["provenance"]}
    report["quantum_evidence"] = "none: no independently authenticated proof of quantum origin is available"
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("receipt")
    ap.add_argument("keys", nargs="?")
    ap.add_argument("--value", help="the secret this receipt commits to (checked locally, never sent anywhere)")
    ap.add_argument("--salt", help="the base64url salt returned with the secret")
    ap.add_argument("--entries", help="JSON file with the published entry list (draws)")
    ap.add_argument("--json", action="store_true", help="print a machine-readable report")
    a = ap.parse_args(argv)
    try:
        with open(a.receipt, encoding="utf-8") as f:
            receipt, bundled_keys = unwrap(json.load(f))
        if a.keys:
            with open(a.keys, encoding="utf-8") as f:
                keyset = json.load(f)
        elif bundled_keys:
            keyset = bundled_keys
            print("warning: using keys bundled with the receipt; compare their key_id with the issuer's "
                  "/.well-known/quantumpass-keys.json", file=sys.stderr)
        else:
            ap.error("a keys file is required")
        entries = None
        if a.entries:
            with open(a.entries, encoding="utf-8") as f:
                entries = json.load(f)
            if not isinstance(entries, list) or not all(isinstance(e, str) for e in entries):
                raise ValueError("entries file must be a JSON list of strings")
    except (OSError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    report = verify(receipt, keyset, a.value, a.salt, entries)
    if a.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        for c in report["checks"]:
            print(f"{'ok  ' if c['ok'] else 'FAIL'}  {c['check']}" + (f"  ({c['detail']})" if c.get("detail") else ""))
        if "provenance" in report:
            p = report["provenance"]
            print(f"info  provenance, operator-asserted: sources={','.join(p['sources'])} quantum={p['quantum']}"
                  f" ibm_jobs={p.get('ibm_jobs')}")
            print(f"info  quantum evidence: {report['quantum_evidence']}")
        print("VALID" if report["valid"] else "INVALID")
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
