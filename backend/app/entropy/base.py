from typing import Protocol


class EntropyError(Exception):
    """A provider could not deliver entropy (network, quota, malformed data, failed health test).

    `cooldown_s` asks the circuit breaker to back off longer (auth/quota errors); `transient` marks failures
    that aren't the provider's fault (our own connection-pool exhaustion) and shouldn't trip the breaker.
    """

    def __init__(self, message: str, cooldown_s: float | None = None, transient: bool = False):
        super().__init__(message)
        self.cooldown_s = cooldown_s
        self.transient = transient


AUTH_OR_QUOTA_COOLDOWN_S = 3600.0


def http_error(provider: str, exc: Exception) -> EntropyError:
    """Map an httpx failure to an EntropyError with the right breaker behaviour."""
    import httpx

    if isinstance(exc, httpx.PoolTimeout):
        return EntropyError(f"{provider}: local connection pool busy", transient=True)
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403, 429):
        retry = exc.response.headers.get("retry-after", "")
        cooldown = float(retry) if retry.isdigit() else AUTH_OR_QUOTA_COOLDOWN_S
        return EntropyError(f"{provider} request refused ({exc.response.status_code})", cooldown_s=cooldown)
    return EntropyError(f"{provider} request failed: {exc.__class__.__name__}")


class EntropyProvider(Protocol):
    name: str
    is_quantum: bool

    @property
    def configured(self) -> bool: ...

    async def fetch(self, n: int) -> bytes:
        """Return exactly n raw bytes or raise EntropyError."""
        ...
