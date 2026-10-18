"""Run Alembic migrations programmatically (used at startup on PostgreSQL and by the restore test)."""

from pathlib import Path

from alembic import command
from alembic.config import Config

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def alembic_config() -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.attributes["skip_logging_config"] = True
    return cfg


def upgrade_head() -> None:
    command.upgrade(alembic_config(), "head")
