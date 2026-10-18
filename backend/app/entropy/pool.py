"""Consume-once byte pool, fed by the IBM Quantum harvester (QPU jobs are slow, so we pre-harvest)."""

import asyncio
import os
from pathlib import Path


class EntropyPool:
    def __init__(self, path: str | None = None, max_bytes: int = 1 << 20):
        self._buf = bytearray()
        self._lock = asyncio.Lock()
        self._path = Path(path) if path else None
        self._max = max_bytes
        self.total_harvested = 0
        if self._path and self._path.exists():
            self._buf.extend(self._path.read_bytes()[: self._max])

    def __len__(self) -> int:
        return len(self._buf)

    async def add(self, data: bytes) -> None:
        async with self._lock:
            room = self._max - len(self._buf)
            self._buf.extend(data[:room])
            self.total_harvested += min(len(data), room)
            self._persist()

    async def take(self, n: int) -> bytes | None:
        """Remove and return n bytes, or None if the pool is short. Bytes are never reused."""
        async with self._lock:
            if len(self._buf) < n:
                return None
            out = bytes(self._buf[:n])
            del self._buf[:n]
            self._persist()
            return out

    def _persist(self) -> None:
        if not self._path:
            return
        tmp = self._path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(self._buf)
        os.replace(tmp, self._path)
