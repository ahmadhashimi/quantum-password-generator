"""Alembic environment: uses the app's settings and SQLModel metadata."""

from logging.config import fileConfig

from alembic import context
from sqlmodel import SQLModel

from app import db  # noqa: F401  (registers tables on SQLModel.metadata)
from app.config import get_settings

config = context.config
if config.config_file_name and not config.attributes.get("skip_logging_config"):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(url=get_settings().database_url, target_metadata=target_metadata, literal_binds=True,
                      compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = config.attributes.get("connection")
    if connectable is None:
        connectable = db.engine()
    with connectable.connect() if hasattr(connectable, "connect") else connectable as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
