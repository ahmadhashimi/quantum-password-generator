"""LfD QRNG (https://lfdr.de/qrng_api) — photonic QRNG, free, no API key."""

import httpx

from .base import EntropyError

MAX_PER_REQUEST = 1024


class LfDProvider:
    name = "lfd"
    is_quantum = True

    def __init__(self, client: httpx.AsyncClient, url: str, timeout: float):
        self._client = client
        self._url = url
        self._timeout = timeout

    @property
    def configured(self) -> bool:
        return True

    async def fetch(self, n: int) -> bytes:
        if not 0 < n <= MAX_PER_REQUEST:
            raise EntropyError(f"LfD supports 1..{MAX_PER_REQUEST} bytes per request")
        try:
            r = await self._client.get(self._url, params={"length": n, "format": "HEX"}, timeout=self._timeout)
            r.raise_for_status()
            hex_str = r.json()["qrn"]
            data = bytes.fromhex(hex_str)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
            raise EntropyError(f"LfD request failed: {e.__class__.__name__}") from e
        if len(data) != n:
            raise EntropyError("LfD returned wrong length")
        return data
