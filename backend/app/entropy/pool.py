"""Consume-once byte pool, fed by the IBM Quantum harvester (QPU jobs are slow, so we pre-harvest).

Each chunk keeps the metadata of the job that produced it, so a receipt can name exactly the jobs whose
bytes it consumed.
"""

import asyncio
import base64
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


@dataclass
class Chunk:
    meta: dict[str, Any]
    data: bytearray = field(default_factory=bytearray)


class EntropyPool:
    def __init__(self, path: str | None = None, max_bytes: int = 1 << 20):
        self._chunks: list[Chunk] = []
        self._lock = asyncio.Lock()
        self._path = Path(path) if path else None
        self._max = max_bytes
        self.total_harvested = 0
        self._dirty = False
        self._last_persist = 0.0
        if self._path and self._path.exists():
            self._load()

    def __len__(self) -> int:
        return sum(len(c.data) for c in self._chunks)

    def _load(self) -> None:
        assert self._path is not None
        try:
            saved = json.loads(self._path.read_text())
            self._chunks = [Chunk(c["meta"], bytearray(base64.b64decode(c["data"]))) for c in saved["chunks"]]
        except (ValueError, KeyError, TypeError):
            log.warning("Discarding entropy pool file without job metadata: %s", self._path)
            self._chunks = []

    async def add(self, data: bytes, meta: dict[str, Any]) -> None:
        async with self._lock:
            room = self._max - len(self)
            if room <= 0:
                return
            self._chunks.append(Chunk(dict(meta), bytearray(data[:room])))
            self.total_harvested += min(len(data), room)
            self._persist()

    async def take(self, n: int) -> tuple[bytes, list[dict[str, Any]]] | None:
        """Remove n bytes (never reused) and return them with the metadata of every job they came from."""
        async with self._lock:
            if len(self) < n:
                return None
            out, metas = bytearray(), []
            while len(out) < n:
                chunk = self._chunks[0]
                need = n - len(out)
                out += chunk.data[:need]
                del chunk.data[:need]
                if chunk.meta not in metas:
                    metas.append(chunk.meta)
                if not chunk.data:
                    self._chunks.pop(0)
            # Debounced: rewriting the file on every request would be a DoS vector. A crash can at worst re-serve
            # up to 30 s of pool bytes, which are always mixed with fresh os.urandom anyway.
            self._dirty = True
            if time.monotonic() - self._last_persist > 30:
                self._persist()
            return bytes(out), metas

    def flush(self) -> None:
        if self._dirty:
            self._persist()

    def _persist(self) -> None:
        self._dirty, self._last_persist = False, time.monotonic()
        if not self._path:
            return
        payload = {"chunks": [{"meta": c.meta, "data": base64.b64encode(c.data).decode()} for c in self._chunks]}
        tmp = self._path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f)
        os.replace(tmp, self._path)
