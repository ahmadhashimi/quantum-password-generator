"""Combine quantum entropy with the OS CSPRNG and expand it into a keystream.

Security property: output is at least as strong as the stronger input. A tampered or biased remote
QRNG (or a network attacker) can't weaken passwords, because os.urandom is always mixed in; and a
broken local RNG is rescued by the quantum input.
"""

import hashlib
import hmac
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

INFO = b"quantum-password-generator/v2"


def derive_key(quantum: bytes, local: bytes | None = None) -> bytes:
    local = os.urandom(64) if local is None else local
    return HKDF(algorithm=hashes.SHA512(), length=64, salt=None, info=INFO).derive(quantum + local)


class KeyStream:
    """HMAC-SHA512 in counter mode: an unbounded deterministic byte stream from a 512-bit key."""

    def __init__(self, key: bytes):
        self._key = key
        self._counter = 0
        self._buf = b""

    @property
    def key(self) -> bytes:
        """The 64-byte key. Only ever exposed for public draws, where it is published as the selection seed."""
        return self._key

    def read(self, n: int) -> bytes:
        while len(self._buf) < n:
            block = hmac.new(self._key, self._counter.to_bytes(8, "big"), hashlib.sha512).digest()
            self._buf += block
            self._counter += 1
        out, self._buf = self._buf[:n], self._buf[n:]
        return out


def condition(raw: bytes, ratio: int = 4) -> bytes:
    """Compress raw (possibly biased) hardware bits: each `ratio*16` raw bytes -> 16 output bytes."""
    chunk = 16 * ratio
    out = bytearray()
    for i in range(0, len(raw) - chunk + 1, chunk):
        out += hashlib.sha256(raw[i : i + chunk]).digest()[:16]
    return bytes(out)
