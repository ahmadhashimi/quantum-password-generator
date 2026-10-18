"""Pull samples from each live quantum source and run statistical sanity checks.

    python -m scripts.entropy_audit --kb 8

Reports Shannon entropy, monobit, runs and chi-square per source. Not a certification (that needs the
full NIST SP 800-22 / 800-90B suites on megabytes of data), but it catches broken or fake sources fast.
"""

import argparse
import asyncio
import math
import os
from collections import Counter

import httpx

from app.config import get_settings
from app.entropy.anu import ANUProvider
from app.entropy.base import EntropyError
from app.entropy.health import HealthMonitor
from app.entropy.lfd import LfDProvider


def stats(data: bytes) -> dict:
    n = len(data)
    counts = Counter(data)
    shannon = -sum(c / n * math.log2(c / n) for c in counts.values())
    min_entropy = -math.log2(max(counts.values()) / n)
    bits = n * 8
    ones = sum(bin(b).count("1") for b in data)
    monobit_z = abs(ones - bits / 2) / math.sqrt(bits / 4)
    bitstr = "".join(f"{b:08b}" for b in data)
    runs = 1 + sum(bitstr[i] != bitstr[i - 1] for i in range(1, bits))
    pi = ones / bits
    runs_z = abs(runs - 2 * bits * pi * (1 - pi)) / (2 * math.sqrt(2 * bits) * pi * (1 - pi))
    expected = n / 256
    chi2 = sum((counts.get(i, 0) - expected) ** 2 / expected for i in range(256))
    health = HealthMonitor(7.0).check(data)
    return {
        "bytes": n, "shannon_bits_per_byte": round(shannon, 4), "min_entropy_bits_per_byte": round(min_entropy, 3),
        "monobit_z": round(monobit_z, 2), "runs_z": round(runs_z, 2), "chi2_255dof": round(chi2, 1),
        "sp800_90b_health": health or "pass",
        "verdict": "PASS" if monobit_z < 3.3 and runs_z < 3.3 and 180 < chi2 < 340 and not health else "CHECK",
    }


async def collect(provider, kb: int) -> bytes:
    out = b""
    while len(out) < kb * 1024:
        out += await provider.fetch(1024)
    return out


async def main(kb: int) -> None:
    s = get_settings()
    async with httpx.AsyncClient() as client:
        providers = [LfDProvider(client, s.lfd_api_url, 15)]
        if s.anu_api_key:
            providers.append(ANUProvider(client, s.anu_api_key, s.anu_api_url, 15))
        for p in providers:
            try:
                print(p.name, stats(await collect(p, kb)))
            except EntropyError as e:
                print(p.name, "UNAVAILABLE:", e)
    print("os_csprng (reference)", stats(os.urandom(kb * 1024)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kb", type=int, default=8)
    asyncio.run(main(ap.parse_args().kb))
