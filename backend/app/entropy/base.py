from typing import Protocol


class EntropyError(Exception):
    """A provider could not deliver entropy (network, quota, malformed data, failed health test)."""


class EntropyProvider(Protocol):
    name: str
    is_quantum: bool

    @property
    def configured(self) -> bool: ...

    async def fetch(self, n: int) -> bytes:
        """Return exactly n raw bytes or raise EntropyError."""
        ...
