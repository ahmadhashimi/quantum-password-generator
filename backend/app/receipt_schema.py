"""Strict schemas for receipt payloads, per version and kind.

Verification rejects anything that is not exactly one of these shapes: unknown versions, unknown kinds, extra
fields, wrong types, malformed identifiers. v1 receipts (issued before V2.1) remain verifiable; new receipts are v2,
which add an explicit `evidence` block separating what is cryptographically verifiable from what the server merely
reports.
"""

import time
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

V1 = "qpg-receipt/1"
V2 = "qpg-receipt/2"
SUPPORTED_VERSIONS = (V1, V2)

Kind = Literal["password", "passphrase", "random", "draw_commit", "draw"]
SECRET_KINDS = ("password", "passphrase", "random")

ReceiptId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{16}$")]
KeyId = Annotated[str, Field(pattern=r"^[0-9a-f]{16}$")]
Hex128 = Annotated[str, Field(pattern=r"^[0-9a-f]{128}$")]
Hex64 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
ShortText = Annotated[str, Field(max_length=200)]

# Receipts are checked for an issue time no earlier than this (2026-01-01) and no later than now + 5 minutes.
EARLIEST_ISSUED_AT = 1_767_225_600
CLOCK_SKEW_S = 300


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class IbmJob(_Strict):
    backend: ShortText
    job_id: Annotated[str, Field(max_length=100)] | None
    mode: Literal["hardware", "simulator"]


class Provenance(_Strict):
    """Operator-asserted: what the issuing server reports about where the entropy came from."""

    sources: Annotated[list[Annotated[str, Field(pattern=r"^[a-z0-9_]{1,32}$")]], Field(max_length=8)]
    quantum: bool
    quantum_bytes: Annotated[int, Field(ge=0, le=1 << 20)]
    mixed_with: Literal["os_csprng", "none"]
    ibm_jobs: Annotated[list[IbmJob], Field(max_length=64)] | None = None
    health: dict[Annotated[str, Field(max_length=32)], Literal["pass", "n/a"]] | None = None


class Evidence(_Strict):
    """What each part of a receipt does and does not prove (v2+)."""

    integrity: Literal["hybrid-signature:ed25519+ml-dsa-65"]
    provenance: Literal["operator-asserted"]
    quantum_evidence: Literal["none"]


class Winner(_Strict):
    index: Annotated[int, Field(ge=0, lt=10_000)]
    entry: ShortText


class Selection(_Strict):
    algorithm: Literal["qpg-select/1"]
    seed_hex: Hex128


class DrawResult(_Strict):
    winners: Annotated[list[Winner], Field(min_length=1, max_length=1000)]
    selection: Selection | None = None  # present on v2 draw receipts


class DrawCommitDetails(_Strict):
    draw_id: ReceiptId
    title: ShortText
    entries_count: Annotated[int, Field(ge=1, le=10_000)]
    entries_sha256: Hex64
    winners: Annotated[int, Field(ge=1, le=1000)]


class DrawDetails(DrawCommitDetails):
    commit_receipt_id: ReceiptId
    recovered: bool | None = None  # completed by an operator from the persisted seed after an interruption


class _PayloadBase(_Strict):
    receipt_id: ReceiptId
    issued_at: int
    kind: Kind
    key_id: KeyId
    provenance: Provenance
    entropy_bits: Annotated[float, Field(ge=0, le=8192)] | None
    commitment: Hex128 | None
    result: DrawResult | None
    details: dict[str, Any]

    @model_validator(mode="after")
    def _kind_rules(self) -> "_PayloadBase":
        now = int(time.time())
        if not EARLIEST_ISSUED_AT <= self.issued_at <= now + CLOCK_SKEW_S:
            raise ValueError("issued_at out of range")
        if self.kind in SECRET_KINDS:
            if self.commitment is None or self.result is not None:
                raise ValueError(f"{self.kind} receipts carry a commitment and no public result")
            if set(self.details) - {"length", "words", "bytes"}:
                raise ValueError("unexpected details for a secret receipt")
            if not all(isinstance(v, int) and not isinstance(v, bool) and 0 < v <= 4096
                       for v in self.details.values()):
                raise ValueError("secret receipt details must be small positive integers")
        elif self.kind == "draw_commit":
            if self.commitment is not None or self.result is not None:
                raise ValueError("draw_commit receipts carry neither a commitment nor a result")
            DrawCommitDetails.model_validate(self.details, strict=True)
        else:  # draw
            if self.commitment is not None or self.result is None:
                raise ValueError("draw receipts carry a public result and no commitment")
            details = DrawDetails.model_validate(self.details, strict=True)
            if len(self.result.winners) != details.winners:
                raise ValueError("winner count does not match details")
            if any(w.index >= details.entries_count for w in self.result.winners):
                raise ValueError("winner index out of range")
        return self


class PayloadV1(_PayloadBase):
    version: Literal["qpg-receipt/1"]


class PayloadV2(_PayloadBase):
    version: Literal["qpg-receipt/2"]
    evidence: Evidence

    @model_validator(mode="after")
    def _v2_rules(self) -> "PayloadV2":
        if self.kind == "draw" and (self.result is None or self.result.selection is None):
            raise ValueError("v2 draw receipts publish their selection seed")
        return self


def validate_payload(payload: Any) -> tuple[bool, str | None]:
    """Return (ok, error). Never raises."""
    if not isinstance(payload, dict):
        return False, "payload must be an object"
    version = payload.get("version")
    if version not in SUPPORTED_VERSIONS:
        return False, "unsupported_version"
    model = PayloadV1 if version == V1 else PayloadV2
    try:
        model.model_validate(payload, strict=True)
    except ValidationError as e:
        first = e.errors()[0]
        loc = ".".join(str(p) for p in first.get("loc", ()))
        return False, f"{loc}: {first.get('msg', 'invalid')}"[:200]
    return True, None
