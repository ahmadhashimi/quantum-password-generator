"""Runtime configuration, loaded from environment variables (or a .env file)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Safe by default: development mode (auto-signed-in local admin when Clerk is off) must be opted into.
    environment: Literal["development", "production", "test"] = "production"
    # Browser origins allowed to call the API cross-origin (local Next.js dev server). In production the site and
    # the API share one origin behind Caddy, so CORS is not exercised; keep this to your own domain.
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    # Host header allowlist; also blocks DNS-rebinding attacks against a local dev server. Set your domain in prod.
    allowed_hosts: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])
    log_format: Literal["json", "text"] | None = None  # default: text in development, JSON lines otherwise
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    admin_require_mfa: bool = True  # admin API needs a second factor verified within the last hour

    # Quantum entropy providers
    anu_api_key: str | None = None
    anu_api_url: str = "https://api.quantumnumbers.anu.edu.au"
    lfd_api_url: str = "https://lfdr.de/qrng_api/qrng"
    provider_timeout_s: float = 4.0
    anu_min_interval_s: float = 300.0  # ANU bills/limits per call: ≤ 288 calls/day, each buffering 16 seeds
    lfd_min_interval_s: float = 10.0  # be a good citizen to a free public service
    pool_seeds_per_user_per_day: int = 20
    # "hardware" = real IBM QPU (needs token + CRN); "simulator" = local Qiskit Aer run of the same circuit,
    # for testing the pipeline end to end. Simulator output is classical and is never labelled quantum.
    ibm_mode: Literal["hardware", "simulator"] = "hardware"
    ibm_sim_qubits: int = 127
    ibm_quantum_token: str | None = None  # IBM Cloud API key
    ibm_quantum_instance: str | None = None  # instance CRN (Open Plan instances live in us-east)
    ibm_backend: str | None = None  # None = least busy
    ibm_shots: int = 2048
    ibm_harvest_interval_s: int = 6 * 3600
    ibm_pool_min_bytes: int = 4096
    # Hard cap on QPU jobs per rolling 24h. One job (all qubits, 2048 shots) uses seconds of QPU time;
    # the Open Plan allows 10 minutes per 28 days, and paid instances bill per second.
    ibm_max_jobs_per_day: int = 2
    pool_path: str | None = None  # persist harvested IBM bytes (file is chmod 600)

    # Assistant
    anthropic_api_key: str | None = None
    assistant_model: str = "claude-sonnet-5-5"
    # Cost guardrails
    assistant_daily_messages_per_user: int = 50
    assistant_user_daily_budget_usd: float = 1.00  # per-user dollar cap (message caps alone don't bound cost)
    assistant_daily_budget_usd: float = 10.0  # global kill switch: assistant pauses when today's spend hits this
    assistant_monthly_budget_usd: float = 150.0
    assistant_max_tokens: int = 1500
    assistant_max_tool_iterations: int = 3

    # Clerk
    clerk_secret_key: str | None = None
    clerk_jwt_key: str | None = None  # optional PEM for networkless verification
    clerk_webhook_secret: str | None = None

    # Receipt signing keys: SIGNING_KEYS (JSON of base64 seeds) or a 0600 key file created on first start.
    signing_keys: str | None = None
    signing_key_path: str | None = "./signing_keys.json"
    retired_signing_keys: str | None = None  # JSON list of retired/revoked public key sets

    database_url: str = "sqlite:///./qpg.db"

    # Rate limits (slowapi syntax)
    rate_limit_anonymous: str = "30/minute"
    rate_limit_user: str = "120/minute"
    rate_limit_assistant: str = "20/minute"

    @property
    def assistant_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def auth_enabled(self) -> bool:
        return bool(self.clerk_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
