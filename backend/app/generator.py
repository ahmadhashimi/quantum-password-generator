"""Unbiased password / passphrase generation from a KeyStream."""

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .entropy.mixer import KeyStream

UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
LOWER = "abcdefghijklmnopqrstuvwxyz"
DIGITS = "0123456789"
SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?/~"
AMBIGUOUS = set("Il1|O0oS5B8Z2")


@dataclass(frozen=True)
class PasswordOptions:
    length: int = 20
    upper: bool = True
    lower: bool = True
    digits: bool = True
    symbols: bool = True
    exclude_ambiguous: bool = False
    require_each: bool = True


def build_classes(o: PasswordOptions) -> list[str]:
    classes = [c for c, on in ((UPPER, o.upper), (LOWER, o.lower), (DIGITS, o.digits), (SYMBOLS, o.symbols)) if on]
    if o.exclude_ambiguous:
        classes = ["".join(ch for ch in c if ch not in AMBIGUOUS) for c in classes]
    classes = [c for c in classes if c]
    if not classes:
        raise ValueError("Select at least one character set")
    return classes


def uniform_index(stream: KeyStream, n: int) -> int:
    """Uniform integer in [0, n) by rejection sampling (no modulo bias)."""
    if not 0 < n <= 1 << 16:
        raise ValueError("n out of range")
    nbytes = 1 if n <= 256 else 2
    space = 1 << (8 * nbytes)
    limit = space - space % n
    while True:
        v = int.from_bytes(stream.read(nbytes), "big")
        if v < limit:
            return v % n


def password_entropy_bits(classes: list[str], length: int, require_each: bool) -> float:
    """Exact log2 of the number of possible passwords (inclusion-exclusion when every class is required)."""
    sizes = [len(c) for c in classes]
    m = sum(sizes)
    if not require_each:
        return length * math.log2(m)
    k = len(sizes)
    total = 0
    for mask in range(1 << k):
        excluded = sum(sizes[i] for i in range(k) if mask >> i & 1)
        sign = -1 if bin(mask).count("1") % 2 else 1
        total += sign * (m - excluded) ** length
    return math.log2(total) if total > 0 else 0.0


def generate_password(stream: KeyStream, o: PasswordOptions) -> tuple[str, float]:
    classes = build_classes(o)
    if o.require_each and o.length < len(classes):
        raise ValueError("Length is shorter than the number of required character sets")
    charset = "".join(classes)
    while True:  # resample the whole password: uniform over all valid passwords
        pw = "".join(charset[uniform_index(stream, len(charset))] for _ in range(o.length))
        if not o.require_each or all(any(ch in c for ch in pw) for c in classes):
            return pw, password_entropy_bits(classes, o.length, o.require_each)


@lru_cache
def wordlist() -> tuple[str, ...]:
    """EFF large wordlist minus a small denylist. Entropy is computed from the filtered length."""
    data = Path(__file__).parent / "data"
    words = (data / "eff_large_wordlist.txt").read_text().split()
    if len(words) != 7776:
        raise RuntimeError("EFF wordlist is corrupted")
    excluded = {w for w in (data / "wordlist_exclude.txt").read_text().split("\n") if w and not w.startswith("#")}
    return tuple(w for w in words if w not in excluded)


def generate_passphrase(stream: KeyStream, words: int, separator: str = "-", capitalize: bool = False,
                        add_number: bool = False) -> tuple[str, float]:
    wl = wordlist()
    picked = [wl[uniform_index(stream, len(wl))] for _ in range(words)]
    if capitalize:
        picked = [w.capitalize() for w in picked]
    bits = words * math.log2(len(wl))
    if add_number:
        picked.append(str(uniform_index(stream, 100)))
        bits += math.log2(100)
    return separator.join(picked), bits


def draw_winners(stream: KeyStream, entries: list[str], winners: int) -> list[int]:
    """Pick `winners` distinct indexes uniformly (partial Fisher-Yates with unbiased sampling)."""
    if not 0 < winners <= len(entries):
        raise ValueError("Winners must be between 1 and the number of entries")
    idx = list(range(len(entries)))
    for i in range(winners):
        j = i + uniform_index(stream, len(idx) - i)
        idx[i], idx[j] = idx[j], idx[i]
    return idx[:winners]
