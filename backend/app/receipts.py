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
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.mldsa import MLDSA65PrivateKey, MLDSA65PublicKey

RECEIPT_VERSION = "qpg-receipt/1"
ALGORITHMS = ("ed25519", "ml-dsa-65")


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
        """Keys come from SIGNING_KEYS (JSON of base64 seeds), else a 0600 key file, else are created there."""
        if env_seeds:
            return cls.from_seeds(json.loads(env_seeds))
        if path and Path(path).exists():
            return cls.from_seeds(json.loads(Path(path).read_text()))
        signer = cls.generate()
        if path:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                json.dump(signer.seeds(), f)
        return signer

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
        msg = canonical(payload)
        return {"ed25519": b64(self.ed25519.sign(msg)), "ml-dsa-65": b64(self.mldsa.sign(msg))}


def verify_signatures(payload: dict, signatures: dict, public_keys: dict) -> dict[str, bool]:
    msg = canonical(payload)
    results = {}
    try:
        Ed25519PublicKey.from_public_bytes(unb64(public_keys["ed25519"])).verify(unb64(signatures["ed25519"]), msg)
        results["ed25519"] = True
    except (InvalidSignature, KeyError, ValueError):
        results["ed25519"] = False
    try:
        MLDSA65PublicKey.from_public_bytes(unb64(public_keys["ml-dsa-65"])).verify(unb64(signatures["ml-dsa-65"]), msg)
        results["ml-dsa-65"] = True
    except (InvalidSignature, KeyError, ValueError):
        results["ml-dsa-65"] = False
    return results


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
        | {k: provenance[k] for k in ("ibm_job", "health") if k in provenance},
        "entropy_bits": round(entropy_bits, 2) if entropy_bits is not None else None,
        "commitment": commitment(secret_value, salt) if secret_value is not None and salt else None,
        "result": public_result,
        "details": details or {},
    }
    return {"payload": payload, "signatures": signer.sign(payload), "algorithms": list(ALGORITHMS)}, (
        b64(salt) if salt else None)


def check_commitment(payload: dict, value: str, salt_b64: str) -> bool:
    expected = payload.get("commitment")
    return bool(expected) and hmac.compare_digest(expected, commitment(value, unb64(salt_b64)))
