"""ANU Quantum Numbers API — vacuum-fluctuation QRNG (https://quantumnumbers.anu.edu.au)."""

import httpx

from .base import EntropyError, http_error

MAX_PER_REQUEST = 1024


class ANUProvider:
    name = "anu"
    is_quantum = True

    def __init__(self, client: httpx.AsyncClient, api_key: str | None, url: str, timeout: float):
        self._client = client
        self._api_key = api_key
        self._url = url
        self._timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def fetch(self, n: int) -> bytes:
        if not self._api_key:
            raise EntropyError("ANU API key not configured")
        if not 0 < n <= MAX_PER_REQUEST:
            raise EntropyError(f"ANU supports 1..{MAX_PER_REQUEST} bytes per request")
        try:
            r = await self._client.get(
                self._url,
                params={"length": n, "type": "uint8"},
                headers={"x-api-key": self._api_key},
                timeout=self._timeout,
            )
            r.raise_for_status()
            body = r.json()
        except httpx.HTTPError as e:
            raise http_error("ANU", e) from e
        except ValueError as e:
            raise EntropyError("ANU returned invalid JSON") from e
        data = body.get("data") if isinstance(body, dict) else None
        if not body.get("success") or not isinstance(data, list) or len(data) != n:
            raise EntropyError("ANU returned malformed payload")
        if not all(isinstance(v, int) and 0 <= v <= 255 for v in data):
            raise EntropyError("ANU returned out-of-range values")
        return bytes(data)
