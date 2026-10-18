import os

import pytest

os.environ.setdefault("ENVIRONMENT", "development")


@pytest.fixture(autouse=True)
def _isolated_settings(tmp_path, monkeypatch):
    from app import db
    from app.config import get_settings

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    for var in ("ANU_API_KEY", "IBM_QUANTUM_TOKEN", "ANTHROPIC_API_KEY", "CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET"):
        monkeypatch.delenv(var, raising=False)
    get_settings.cache_clear()
    db.reset_engine()
    from app.ratelimit import limiter
    limiter.reset()
    yield
    get_settings.cache_clear()
    db.reset_engine()


class FakeProvider:
    is_quantum = True
    configured = True

    def __init__(self, name="fake_qrng", data=None, error=None):
        self.name = name
        self._data = data
        self._error = error
        self.calls = 0

    async def fetch(self, n):
        from app.entropy.base import EntropyError

        self.calls += 1
        if self._error:
            raise EntropyError(self._error)
        if self._data is not None:
            return self._data[:n]
        return os.urandom(n)


@pytest.fixture
def fake_provider():
    return FakeProvider()
