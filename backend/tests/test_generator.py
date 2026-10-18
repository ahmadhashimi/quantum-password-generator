import math
from collections import Counter

import pytest

from app.entropy.mixer import KeyStream, derive_key
from app.generator import (
    DIGITS,
    LOWER,
    SYMBOLS,
    UPPER,
    PasswordOptions,
    build_classes,
    generate_passphrase,
    generate_password,
    password_entropy_bits,
    uniform_index,
    wordlist,
)


def stream(seed=b"\x01" * 64):
    return KeyStream(derive_key(seed, b"\x02" * 64))


def chi_square_p_ok(counts: Counter, n_bins: int, total: int) -> bool:
    expected = total / n_bins
    chi2 = sum((counts.get(i, 0) - expected) ** 2 / expected for i in range(n_bins))
    dof = n_bins - 1
    # Wilson–Hilferty: reject only at ~ z > 4.5 (p ≈ 3e-6) to keep the test non-flaky.
    z = ((chi2 / dof) ** (1 / 3) - (1 - 2 / (9 * dof))) / math.sqrt(2 / (9 * dof))
    return z < 4.5


@pytest.mark.parametrize("n", [2, 10, 79, 89, 200, 7776])
def test_uniform_index_is_unbiased(n):
    s = stream()
    total = 60 * n if n < 1000 else 300_000
    counts = Counter(uniform_index(s, n) for _ in range(total))
    assert set(counts) <= set(range(n))
    assert chi_square_p_ok(counts, n, total)


def test_v1_modulo_bias_would_fail_this_check():
    # Demonstrates why v1's `byte % 79` was wrong: low indexes are ~33% more likely.
    counts = Counter(b % 79 for b in range(256))
    assert counts[0] == 4 and counts[78] == 3


def test_password_respects_options():
    pw, bits = generate_password(stream(), PasswordOptions(length=32, symbols=False))
    assert len(pw) == 32 and not set(pw) & set(SYMBOLS)
    assert set(pw) & set(UPPER) and set(pw) & set(LOWER) and set(pw) & set(DIGITS)
    assert 180 < bits < 32 * math.log2(62)


def test_exclude_ambiguous():
    for i in range(50):
        pw, _ = generate_password(stream(bytes([i]) * 64), PasswordOptions(length=64, exclude_ambiguous=True))
        assert not set(pw) & set("Il1|O0oS5B8Z2")


def test_requires_a_charset():
    with pytest.raises(ValueError):
        build_classes(PasswordOptions(upper=False, lower=False, digits=False, symbols=False))


def test_entropy_matches_bruteforce_count():
    classes = ["ab", "1"]
    # length 3 over {a,b,1} with each class present: 27 - 2^3 (no digit) - 1^3 (no letter) = 18
    assert password_entropy_bits(classes, 3, True) == pytest.approx(math.log2(18))
    assert password_entropy_bits(classes, 3, False) == pytest.approx(3 * math.log2(3))


def test_passphrase():
    assert len(wordlist()) == 7776
    phrase, bits = generate_passphrase(stream(), 6, "-", capitalize=True, add_number=True)
    parts = phrase.split("-")
    assert len(parts) == 7 and parts[-1].isdigit() and all(p[0].isupper() for p in parts[:-1])
    assert bits == pytest.approx(6 * math.log2(7776) + math.log2(100))


def test_keystream_deterministic_and_unbounded():
    a, b = stream(), stream()
    assert a.read(5000) == b.read(5000)
    assert stream(b"\x09" * 64).read(64) != stream().read(64)
