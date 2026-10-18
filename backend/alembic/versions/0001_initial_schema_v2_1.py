"""initial schema (v2.1)

Creates every table, then makes audit_events append-only at the database level: UPDATE and DELETE on it are
rejected by a trigger, so even a compromised application role can't silently rewrite history (the hash chain
would also reveal it).

Revision ID: 0001
Revises: 
Create Date: 2026-10-18 05:28:38.258257
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('audit_events',
    sa.Column('seq', sa.Integer(), nullable=False),
    sa.Column('ts', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.Column('actor', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('action', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('target', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('details', sa.Text(), nullable=False),
    sa.Column('prev_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.PrimaryKeyConstraint('seq')
    )
    op.create_index(op.f('ix_audit_events_action'), 'audit_events', ['action'], unique=False)
    op.create_index(op.f('ix_audit_events_hash'), 'audit_events', ['hash'], unique=False)
    op.create_index(op.f('ix_audit_events_ts'), 'audit_events', ['ts'], unique=False)
    op.create_table('audit_head',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('seq', sa.Integer(), nullable=False),
    sa.Column('hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('draws',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('owner_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('entries_json', sa.Text(), nullable=True),
    sa.Column('entries_sha256', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('entries_count', sa.Integer(), nullable=False),
    sa.Column('winners', sa.Integer(), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('commit_receipt_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('result_receipt_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('seed_hex', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('seed_provenance', sa.Text(), nullable=True),
    sa.Column('run_started_at', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
    sa.Column('run_delay_s', sa.Integer(), nullable=True),
    sa.Column('created_at', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_draws_commit_receipt_id'), 'draws', ['commit_receipt_id'], unique=False)
    op.create_index(op.f('ix_draws_created_at'), 'draws', ['created_at'], unique=False)
    op.create_index(op.f('ix_draws_entries_sha256'), 'draws', ['entries_sha256'], unique=False)
    op.create_index(op.f('ix_draws_owner_id'), 'draws', ['owner_id'], unique=False)
    op.create_index(op.f('ix_draws_result_receipt_id'), 'draws', ['result_receipt_id'], unique=False)
    op.create_index(op.f('ix_draws_status'), 'draws', ['status'], unique=False)
    op.create_table('idempotency_keys',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('endpoint', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('key', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('request_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('response_json', sa.Text(), nullable=False),
    sa.Column('status_code', sa.Integer(), nullable=False),
    sa.Column('created_at', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'endpoint', 'key', name='uq_idempotency_owner_endpoint_key')
    )
    op.create_index(op.f('ix_idempotency_keys_created_at'), 'idempotency_keys', ['created_at'], unique=False)
    op.create_index(op.f('ix_idempotency_keys_owner_id'), 'idempotency_keys', ['owner_id'], unique=False)
    op.create_table('receipts',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('kind', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('user_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('payload', sa.Text(), nullable=False),
    sa.Column('signatures', sa.Text(), nullable=False),
    sa.Column('created_at', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_receipts_created_at'), 'receipts', ['created_at'], unique=False)
    op.create_index(op.f('ix_receipts_kind'), 'receipts', ['kind'], unique=False)
    op.create_index(op.f('ix_receipts_user_id'), 'receipts', ['user_id'], unique=False)
    op.create_table('usage_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('kind', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('length', sa.Integer(), nullable=True),
    sa.Column('entropy_bits', sa.Float(), nullable=True),
    sa.Column('sources', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('quantum', sa.Boolean(), nullable=False),
    sa.Column('via_assistant', sa.Boolean(), nullable=False),
    sa.Column('input_tokens', sa.Integer(), nullable=True),
    sa.Column('output_tokens', sa.Integer(), nullable=True),
    sa.Column('cost_usd', sa.Float(), nullable=True),
    sa.Column('created_at', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_usage_events_created_at'), 'usage_events', ['created_at'], unique=False)
    op.create_index(op.f('ix_usage_events_kind'), 'usage_events', ['kind'], unique=False)
    op.create_index(op.f('ix_usage_events_user_id'), 'usage_events', ['user_id'], unique=False)
    op.create_table('users',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('email', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('created_at', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.Column('last_seen', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.Column('deleted', sa.Boolean(), nullable=False),
    sa.Column('last_event_ts', sa.BigInteger(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.execute("INSERT INTO audit_head (id, seq, hash) VALUES (1, 0, repeat('0', 64))")
    op.execute("""
        CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'audit_events is append-only';
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER audit_events_no_update_delete
        BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_events_no_update_delete ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS audit_events_append_only()")
    op.drop_table('users')
    op.drop_index(op.f('ix_usage_events_user_id'), table_name='usage_events')
    op.drop_index(op.f('ix_usage_events_kind'), table_name='usage_events')
    op.drop_index(op.f('ix_usage_events_created_at'), table_name='usage_events')
    op.drop_table('usage_events')
    op.drop_index(op.f('ix_receipts_user_id'), table_name='receipts')
    op.drop_index(op.f('ix_receipts_kind'), table_name='receipts')
    op.drop_index(op.f('ix_receipts_created_at'), table_name='receipts')
    op.drop_table('receipts')
    op.drop_index(op.f('ix_idempotency_keys_owner_id'), table_name='idempotency_keys')
    op.drop_index(op.f('ix_idempotency_keys_created_at'), table_name='idempotency_keys')
    op.drop_table('idempotency_keys')
    op.drop_index(op.f('ix_draws_status'), table_name='draws')
    op.drop_index(op.f('ix_draws_result_receipt_id'), table_name='draws')
    op.drop_index(op.f('ix_draws_owner_id'), table_name='draws')
    op.drop_index(op.f('ix_draws_entries_sha256'), table_name='draws')
    op.drop_index(op.f('ix_draws_created_at'), table_name='draws')
    op.drop_index(op.f('ix_draws_commit_receipt_id'), table_name='draws')
    op.drop_table('draws')
    op.drop_table('audit_head')
    op.drop_index(op.f('ix_audit_events_ts'), table_name='audit_events')
    op.drop_index(op.f('ix_audit_events_hash'), table_name='audit_events')
    op.drop_index(op.f('ix_audit_events_action'), table_name='audit_events')
    op.drop_table('audit_events')
