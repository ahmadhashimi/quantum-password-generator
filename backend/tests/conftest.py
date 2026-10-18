import os
import uuid

import pytest

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("ALLOWED_HOSTS", '["testserver", "localhost"]')


@pytest.fixture(autouse=True)
def _isolated_settings(tmp_path, monkeypatch):
    from app import db
    from app.config import get_settings

    pg_admin_dsn = os.environ.get("PG_TEST_ADMIN_DSN",
                                 "postgresql://qpg_test:qpg_test@localhost:5432/qpg_test")
    pg_schema = None
    if os.environ.get("QPG_TEST_POSTGRES") == "1":
        import psycopg
        from psycopg import sql

        pg_schema = "qpg_test_" + uuid.uuid4().hex[:20]
        with psycopg.connect(pg_admin_dsn, autocommit=True) as conn:
            conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(pg_schema)))
        monkeypatch.setenv("DATABASE_URL",
                           f"postgresql+psycopg://qpg_test:qpg_test@localhost:5432/qpg_test"
                           f"?options=-csearch_path%3D{pg_schema}")
    else:
        monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("SIGNING_KEY_PATH", str(tmp_path / "signing_keys.json"))
    for var in ("ANU_API_KEY", "IBM_QUANTUM_TOKEN", "ANTHROPIC_API_KEY", "CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET"):
        monkeypatch.delenv(var, raising=False)
    get_settings.cache_clear()
    db.reset_engine()
    from app import auth
    auth._last_upsert.clear()
    from app.ratelimit import limiter
    limiter.reset()
    yield
    get_settings.cache_clear()
    db.reset_engine()
    if pg_schema is not None:
        import psycopg
        from psycopg import sql

        with psycopg.connect(pg_admin_dsn, autocommit=True) as conn:
            conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(pg_schema)))


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
