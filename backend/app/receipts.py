"""Post-quantum signed provenance receipts.

Each receipt is canonical JSON signed twice — Ed25519 (classical) and ML-DSA-65 (NIST FIPS 204, quantum-
resistant). A receipt is valid only if BOTH signatures verify, so it stays trustworthy unless both schemes
are broken.

Secrets never appear in a receipt. For passwords the receipt holds a commitment SHA-512(salt || value);
the salt goes only to the user, who can later prove "this receipt is for my password" without revealing it
to anyone else. Public results (draws, random bytes) are included in clear so anyone can audit them.
"""

import base64
import hashlib
import hmac
import json
import math
import re
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.mldsa import MLDSA65PrivateKey, MLDSA65PublicKey

RECEIPT_VERSION = "qpg-receipt/2"
SUPPORTED_VERSIONS = {"qpg-receipt/1", RECEIPT_VERSION}
SUPPORTED_KINDS = {"password", "passphrase", "random", "draw", "draw_commit"}
ALGORITHMS = ("ed25519", "ml-dsa-65")
# Domain separation (as in the IETF LAMPS composite-signature design): each signature covers a label naming the
# hybrid scheme, so a receipt's Ed25519 or ML-DSA signature can't be lifted out and presented as a stand-alone
# single-algorithm signature over the same payload.
SIGNING_DOMAIN = b"QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\x00"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def canonical(payload: dict) -> bytes:
    """Deterministic encoding that both the signer and any verifier reproduce exactly."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def commitment(value: str, salt: bytes) -> str:
    return hashlib.sha512(salt + value.encode()).hexdigest()


@dataclass
class Signer:
    ed25519: Ed25519PrivateKey
    mldsa: MLDSA65PrivateKey

    @classmethod
    def generate(cls) -> "Signer":
        return cls(Ed25519PrivateKey.generate(), MLDSA65PrivateKey.generate())

    @classmethod
    def from_seeds(cls, seeds: dict) -> "Signer":
        return cls(Ed25519PrivateKey.from_private_bytes(unb64(seeds["ed25519"])),
                   MLDSA65PrivateKey.from_seed_bytes(unb64(seeds["ml-dsa-65"])))

    @classmethod
    def load_or_create(cls, path: str | None, env_seeds: str | None = None) -> "Signer":
        """Keys come from SIGNING_KEYS (JSON of base64 seeds), else a 0600 key file, else are created there.

        Creation is atomic (write temp file, fsync, hard-link into place) so concurrent first starts can't
        produce a half-written key; an existing key file must not be readable by group or others.
        """
        if env_seeds:
            return cls.from_seeds(json.loads(env_seeds))
        if not path:
            return cls.generate()
        key_path = Path(path)
        if not key_path.exists():
            signer = cls.generate()
            tmp = key_path.with_name(f".{key_path.name}.{secrets.token_hex(6)}.tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(fd, "w") as f:
                    json.dump(signer.seeds(), f)
                    f.flush()
                    os.fsync(f.fileno())
                os.link(tmp, key_path)  # atomic; fails if another process won the race
                return signer
            except FileExistsError:
                pass
            finally:
                tmp.unlink(missing_ok=True)
        st = key_path.stat()
        if st.st_mode & 0o077 or st.st_uid != os.getuid():
            raise PermissionError(f"Signing key {key_path} must be owned by this user with mode 0600")
        return cls.from_seeds(json.loads(key_path.read_text()))

    def seeds(self) -> dict:
        return {"ed25519": b64(self.ed25519.private_bytes_raw()), "ml-dsa-65": b64(self.mldsa.private_bytes_raw())}

    def public_keys(self) -> dict:
        ed = self.ed25519.public_key().public_bytes_raw()
        ml = self.mldsa.public_key().public_bytes_raw()
        return {
            "key_id": hashlib.sha256(ed + ml).hexdigest()[:16],
            "ed25519": b64(ed),
            "ml-dsa-65": b64(ml),
        }

    def sign(self, payload: dict) -> dict:
        msg = SIGNING_DOMAIN + canonical(payload)
        return {"ed25519": b64(self.ed25519.sign(msg)), "ml-dsa-65": b64(self.mldsa.sign(msg))}


class Keyring:
    """The active signer plus public keys of retired signers, so old receipts stay verifiable after rotation.

    RETIRED_SIGNING_KEYS is a JSON list of public key sets ({"key_id", "ed25519", "ml-dsa-65"}) with optional
    "status": "retired" | "revoked" and "revoked_at" (unix seconds). Receipts issued by a revoked key after
    its revoked_at time are rejected.
    """

    def __init__(self, active: Signer, retired: list[dict] | None = None):
        self.active = active
        self._keys = {k["key_id"]: {**k, "status": k.get("status", "retired")} for k in (retired or [])}
        pub = active.public_keys()
        self._keys[pub["key_id"]] = {**pub, "status": "active"}

    @classmethod
    def from_settings(cls, path: str | None, env_seeds: str | None, retired_json: str | None) -> "Keyring":
        return cls(Signer.load_or_create(path, env_seeds), json.loads(retired_json) if retired_json else [])

    def public(self) -> list[dict]:
        return list(self._keys.values())

    def get(self, key_id: object) -> dict | None:
        return self._keys.get(key_id) if isinstance(key_id, str) else None


def receipt_schema_valid(payload: object) -> bool:
    """Strict signed-payload schema check. Keep legacy qpg-receipt/1 verifiable."""
    if not isinstance(payload, dict):
        return False
    version = payload.get("version")
    if not isinstance(version, str) or version not in SUPPORTED_VERSIONS:
        return False
    base = {"version", "receipt_id", "issued_at", "kind", "key_id",
            "provenance", "entropy_bits", "commitment", "result", "details"}
    required = base | ({"evidence"} if payload["version"] == RECEIPT_VERSION else set())
    if set(payload) != required:
        return False
    if not isinstance(payload["receipt_id"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{12,64}", payload["receipt_id"]):
        return False
    if not isinstance(payload["key_id"], str) or not re.fullmatch(r"[a-f0-9]{16}", payload["key_id"]):
        return False
    issued_at = payload["issued_at"]
    if type(issued_at) is not int or issued_at <= 0 or issued_at > time.time() + 300:
        return False
    if not isinstance(payload["kind"], str) or payload["kind"] not in SUPPORTED_KINDS:
        return False
    provenance = payload["provenance"]
    if not isinstance(provenance, dict):
        return False
    if not isinstance(provenance.get("sources"), list) or any(
            not isinstance(source, str) or len(source) > 100 for source in provenance["sources"]):
        return False
    if type(provenance.get("quantum")) is not bool or type(provenance.get("quantum_bytes")) is not int:
        return False
    if not 0 <= provenance["quantum_bytes"] <= 1_000_000 or not isinstance(provenance.get("mixed_with"), str):
        return False
    bits = payload["entropy_bits"]
    if bits is not None and (type(bits) not in (int, float) or not math.isfinite(bits) or bits < 0):
        return False
    commitment = payload["commitment"]
    if commitment is not None and (not isinstance(commitment, str) or not re.fullmatch(r"[a-f0-9]{128}", commitment)):
        return False
    if payload["result"] is not None and not isinstance(payload["result"], dict):
        return False
    if not isinstance(payload["details"], dict):
        return False
    if payload["version"] == RECEIPT_VERSION:
        return payload["evidence"] == {
            "integrity": "hybrid-signature:ed25519+ml-dsa-65",
            "provenance": "operator-asserted",
            "quantum_evidence": "none",
        }
    return True


def verify_signatures(payload: dict, signatures: dict, public_keys: dict) -> dict[str, bool]:
    results = {"ed25519": False, "ml-dsa-65": False}
    try:
        msg = SIGNING_DOMAIN + canonical(payload)
    except (TypeError, ValueError):
        return results
    checks = (("ed25519", Ed25519PublicKey), ("ml-dsa-65", MLDSA65PublicKey))
    for name, key_type in checks:
        try:
            key_type.from_public_bytes(unb64(public_keys[name])).verify(unb64(signatures[name]), msg)
            results[name] = True
        except (InvalidSignature, KeyError, ValueError, TypeError, AttributeError):
            results[name] = False
    return results


def verify_receipt(payload: dict, signatures: dict, keyring: Keyring) -> dict:
    """Full check: known key, both signatures, and not issued after the key's revocation."""
    version_supported = (isinstance(payload, dict) and
                         isinstance(payload.get("version"), str) and
                         payload["version"] in SUPPORTED_VERSIONS)
    schema_valid = receipt_schema_valid(payload)
    invalid = {"ed25519": False, "ml-dsa-65": False}
    if not schema_valid:
        return {"valid": False, "reason": "unsupported_version" if not version_supported else "invalid_schema",
                "signatures": invalid, "schema_valid": False, "version_supported": version_supported,
                "integrity": "invalid", "provenance": "unverified", "quantum_evidence": "none"}
    key = keyring.get(payload.get("key_id"))
    if key is None:
        return {"valid": False, "reason": "unknown_key", "signatures": invalid,
                "schema_valid": True, "version_supported": True,
                "integrity": "invalid", "provenance": "unverified", "quantum_evidence": "none"}
    try:
        true_key_id = hashlib.sha256(unb64(key["ed25519"]) + unb64(key["ml-dsa-65"])).hexdigest()[:16]
    except (KeyError, ValueError, TypeError):
        true_key_id = None
    if true_key_id != payload["key_id"]:
        return {"valid": False, "reason": "key_id_mismatch", "signatures": invalid,
                "schema_valid": True, "version_supported": True,
                "integrity": "invalid", "provenance": "unverified", "quantum_evidence": "none"}
    sigs = verify_signatures(payload, signatures, key)
    revoked = key["status"] == "revoked" and (
        not isinstance(payload.get("issued_at"), int) or payload["issued_at"] >= key.get("revoked_at", 0))
    reason = "revoked_key" if revoked else (None if all(sigs.values()) else "bad_signature")
    return {"valid": reason is None, "reason": reason, "signatures": sigs, "key_status": key["status"],
            "schema_valid": True, "version_supported": True,
            "integrity": "verified" if reason is None else "invalid",
            "provenance": "operator-asserted" if reason is None else "unverified",
            "quantum_evidence": "none"}


def build_receipt(signer: Signer, kind: str, provenance: dict, *, entropy_bits: float | None = None,
                  secret_value: str | None = None, public_result: dict | None = None,
                  details: dict | None = None) -> tuple[dict, str | None]:
    """Return (signed receipt, salt). The salt is only set for secret results and must go to the user alone."""
    salt = secrets.token_bytes(32) if secret_value is not None else None
    payload = {
        "version": RECEIPT_VERSION,
        "receipt_id": secrets.token_urlsafe(12),
        "issued_at": int(time.time()),
        "kind": kind,
        "key_id": signer.public_keys()["key_id"],
        "provenance": {k: provenance[k] for k in ("sources", "quantum", "quantum_bytes", "mixed_with")}
        | {k: provenance[k] for k in ("ibm_jobs", "health") if k in provenance},
        "entropy_bits": round(entropy_bits, 2) if entropy_bits is not None else None,
        "commitment": commitment(secret_value, salt) if secret_value is not None and salt else None,
        "result": public_result,
        "details": details or {},
        "evidence": {"integrity": "hybrid-signature:ed25519+ml-dsa-65",
                     "provenance": "operator-asserted", "quantum_evidence": "none"},
    }
    return {"payload": payload, "signatures": signer.sign(payload), "algorithms": list(ALGORITHMS)}, (
        b64(salt) if salt else None)


def check_commitment(payload: dict, value: str, salt_b64: str) -> bool:
    expected = payload.get("commitment")
    if not isinstance(expected, str) or len(expected) != 128:
        return False
    try:
        salt = unb64(salt_b64)
    except (ValueError, TypeError):
        return False
    return len(salt) == 32 and hmac.compare_digest(expected.encode(), commitment(value, salt).encode())
