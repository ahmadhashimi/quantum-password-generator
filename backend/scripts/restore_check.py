"""Check a restored database: migrations at head, audit chain intact, receipts still verify, row counts.

    python -m scripts.restore_check --database-url postgresql+psycopg://... --keys keys.json [--source-url ...]

`--keys` is a public key set (/.well-known/quantumpass-keys.json, or the "public" entry of an encrypted key backup:
no passphrase is needed to verify). Used by deploy/restore-test.sh; exits 1 on any failure.
"""

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any


def load_keys(path: str) -> dict[str, Any]:
    doc = json.loads(Path(path).read_text())
    if doc.get("format") == "qpg-key-backup/1":  # encrypted backup: only the public part is used
        return {"keys": [doc["public"]]}
    if "keys" in doc:
        return doc
    raise SystemExit(f"{path}: expected a key set or a qpg-key-backup/1 file")


def tables() -> list[str]:
    from sqlmodel import SQLModel

    import app.db  # noqa: F401  (registers the models)

    return [t.name for t in SQLModel.metadata.sorted_tables]


def counts(url: str) -> dict[str, int]:
    from sqlalchemy import create_engine, func, select, table

    eng = create_engine(url)
    with eng.connect() as conn:
        out = {t: int(conn.execute(select(func.count()).select_from(table(t))).scalar_one()) for t in tables()}
    eng.dispose()
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--keys", required=True)
    ap.add_argument("--source-url", help="original database, to compare row counts")
    ap.add_argument("--sample", type=int, default=50, help="receipts to re-verify (default 50)")
    a = ap.parse_args(argv)

    import os

    os.environ["DATABASE_URL"] = a.database_url
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from sqlmodel import select

    from app import db
    from app.config import get_settings
    from app.migrations import alembic_config
    from scripts.verify_receipt import verify

    get_settings.cache_clear()
    db.reset_engine()
    failures: list[str] = []
    report: dict[str, Any] = {}

    head = ScriptDirectory.from_config(alembic_config()).get_current_head()
    with db.engine().connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()
    report["migration"] = {"current": current, "head": head}
    if not db.is_postgres():
        report["migration"]["note"] = "skipped: SQLite schemas are created without Alembic (dev/test only)"
    elif current != head:
        failures.append(f"migration revision {current} != code head {head}")

    chain = db.verify_audit_chain()
    report["audit_chain"] = chain
    if not chain["ok"]:
        failures.append(f"audit chain broken at seq {chain['first_bad_seq']}")

    keys = load_keys(a.keys)
    with db.session() as s:
        ids = list(s.exec(select(db.Receipt.id)))
    sample = random.sample(ids, min(a.sample, len(ids)))  # noqa: S311 - sampling, not security
    bad = []
    for rid in sample:
        r = db.get_receipt(rid)
        if r is None or not verify(r, keys)["valid"]:
            bad.append(rid)
    report["receipts"] = {"total": len(ids), "verified": len(sample) - len(bad), "failed": bad}
    if bad:
        failures.append(f"{len(bad)} of {len(sample)} sampled receipts failed verification")

    restored = counts(a.database_url)
    report["rows"] = restored
    if a.source_url:
        source = counts(a.source_url)
        report["source_rows"] = source
        diff = {t: (source[t], restored[t]) for t in restored if source.get(t) != restored[t]}
        if diff:
            failures.append(f"row counts differ from source: {diff}")

    report["ok"] = not failures
    report["failures"] = failures
    print(json.dumps(report, indent=2, default=str))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
