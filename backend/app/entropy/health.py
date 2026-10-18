"""Continuous health tests from NIST SP 800-90B §4.4, applied to every raw byte from a quantum source.

Each provider keeps its own monitor so state (run length, APT window) carries across batches.
A failure quarantines the provider; the caller falls back to the next source.
"""

import math
from dataclasses import dataclass, field

ALPHA_EXP = 20  # false-positive probability 2^-20, as recommended by SP 800-90B
APT_WINDOW = 512  # window size for non-binary samples


def rct_cutoff(h: float) -> int:
    """Repetition Count Test cutoff: C = 1 + ceil(-log2(alpha) / H)."""
    return 1 + math.ceil(ALPHA_EXP / h)


def apt_cutoff(h: float, window: int = APT_WINDOW) -> int:
    """Adaptive Proportion Test cutoff: smallest c with P(Binom(W-1, 2^-H) >= c) <= alpha.

    The first sample of each window is the reference, so W-1 later samples are compared to it.
    """
    p = 2.0**-h
    alpha = 2.0**-ALPHA_EXP
    n = window - 1
    tail = 1.0
    for c in range(n + 1):
        # tail = P(X >= c)
        if tail <= alpha:
            return c + 1  # count includes the reference sample
        tail -= math.comb(n, c) * p**c * (1 - p) ** (n - c)
    return window


@dataclass
class HealthMonitor:
    """Tracks RCT + APT over a stream of byte samples with assessed min-entropy `h` bits/byte."""

    h: float
    rct_c: int = field(init=False)
    apt_c: int = field(init=False)
    _last: int | None = field(default=None, init=False)
    _run: int = field(default=0, init=False)
    _apt_ref: int | None = field(default=None, init=False)
    _apt_count: int = field(default=0, init=False)
    _apt_seen: int = field(default=0, init=False)
    failures: int = field(default=0, init=False)
    samples: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self.rct_c = rct_cutoff(self.h)
        self.apt_c = apt_cutoff(self.h)

    def check(self, data: bytes) -> str | None:
        """Feed samples; return a failure reason or None if healthy."""
        for b in data:
            self.samples += 1
            # Repetition Count Test
            if b == self._last:
                self._run += 1
                if self._run >= self.rct_c:
                    return self._fail("repetition_count")
            else:
                self._last, self._run = b, 1
            # Adaptive Proportion Test
            if self._apt_ref is None:
                self._apt_ref, self._apt_count, self._apt_seen = b, 1, 1
                continue
            self._apt_seen += 1
            if b == self._apt_ref:
                self._apt_count += 1
                if self._apt_count >= self.apt_c:
                    return self._fail("adaptive_proportion")
            if self._apt_seen >= APT_WINDOW:
                self._apt_ref = None
        return None

    def _fail(self, reason: str) -> str:
        self.failures += 1
        self._last, self._run, self._apt_ref = None, 0, None
        return reason
