"""Claude-powered assistant with password tools.

Secret hygiene: generated passwords are never shown to the model. Tools return metadata plus an opaque
secret_id; the real value goes straight to the browser as a `secret` SSE event.
"""

import asyncio
import json
import logging
import math
import secrets
import time
from collections import OrderedDict
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import anyio
from anthropic import AsyncAnthropic, beta_async_tool
from starlette.concurrency import run_in_threadpool

from .. import db
from ..entropy import EntropyService
from ..generator import PasswordOptions, generate_passphrase, generate_password

SYSTEM_PROMPT = """You are the assistant inside Quantum Password Generator, a web app that creates passwords \
from real quantum random numbers (IBM Quantum hardware, the ANU vacuum-fluctuation QRNG, and the LfD photonic \
QRNG), always mixed with the operating system's CSPRNG.

Help people choose and create strong credentials and understand password security.

How the tools work:
- generate_password and generate_passphrase create a secret and show it directly to the user in the app. You \
receive only a secret_id and metadata (length, entropy bits, entropy sources) — never the secret itself. Refer \
to a result by describing it ("the 24-character password above"), and never invent or type out a password.
- entropy_status reports which quantum sources are online right now.
- estimate_crack_time converts entropy bits into a brute-force time estimate.

Guidance:
- Never ask users to paste or reveal real passwords. If they want feedback on an existing password, point them \
to the strength checker in the app, which runs locally in their browser.
- If provenance shows quantum=false, say plainly that this result came from the classical fallback.
- Recommend a password manager, unique passwords per site, and passkeys/2FA where relevant.
- Be concise and friendly. Use short paragraphs or bullet lists."""

log = logging.getLogger(__name__)

# USD per million tokens: (input, output, cache write, cache read). Update when pricing changes.
PRICING = {
    "claude-opus-5-5": (4.00, 20.00, 5.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 2.50, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.125, 0.01),
}

MAX_TURNS = 40
CONVERSATION_TTL_S = 3600
MAX_CONVERSATIONS = 1000
MAX_CONVERSATIONS_PER_OWNER = 5
MAX_SECRETS_PER_MESSAGE = 3
STREAM_TIMEOUT_S = 90
# Conservative input estimate per model call (system + tools + history) used to reserve cost up front.
RESERVE_INPUT_TOKENS = 30_000


@dataclass
class Conversation:
    owner: str
    messages: list[Any] = field(default_factory=list)
    turns: int = 0
    touched: float = field(default_factory=time.monotonic)


class ConversationStore:
    """In-memory, append-only conversation history (kept server-side so thinking blocks replay unchanged)."""

    def __init__(self) -> None:
        self._items: OrderedDict[str, Conversation] = OrderedDict()

    def get_or_create(self, conv_id: str | None, owner: str) -> tuple[str, Conversation]:
        self._evict()
        if conv_id and (c := self._items.get(conv_id)) and c.owner == owner:
            c.touched = time.monotonic()
            self._items.move_to_end(conv_id)
            return conv_id, c
        owned = [k for k, c in self._items.items() if c.owner == owner]
        for k in owned[: max(0, len(owned) - MAX_CONVERSATIONS_PER_OWNER + 1)]:  # evict this owner's oldest only
            del self._items[k]
        new_id = secrets.token_urlsafe(16)
        self._items[new_id] = Conversation(owner)
        return new_id, self._items[new_id]

    def delete(self, conv_id: str, owner: str) -> None:
        c = self._items.get(conv_id)
        if c and c.owner == owner:
            del self._items[conv_id]

    def _evict(self) -> None:
        now = time.monotonic()
        for k in [k for k, c in self._items.items() if now - c.touched > CONVERSATION_TTL_S]:
            del self._items[k]
        while len(self._items) > MAX_CONVERSATIONS:
            self._items.popitem(last=False)


def crack_time(bits: float, guesses_per_second: float = 1e12) -> str:
    seconds = 2 ** (bits - 1) / guesses_per_second  # expected: half the keyspace
    if seconds < 1:
        return "instantly"
    units = [("years", 31_557_600), ("days", 86_400), ("hours", 3_600), ("minutes", 60), ("seconds", 1)]
    for name, size in units:
        if seconds >= size:
            v = seconds / size
            if name == "years" and v >= 1e6:
                return f"about 10^{math.floor(math.log10(v))} years"
            return f"about {v:,.0f} {name}"
    return "instantly"


def _fallback_params(model: str) -> dict[str, Any]:
    """Server-side refusal fallback where the model supports it. Haiku 5.5 has none (a fallback list is a 400),
    so its refusals are handled client-side like every other model's."""
    if model.startswith("claude-haiku"):
        return {}
    return {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}


def _prices(model: str) -> tuple[float, float, float, float]:
    return PRICING.get(model, PRICING["claude-opus-5-5"])  # unknown model (e.g. a fallback): assume priciest


@dataclass
class TokenUsage:
    input: int = 0
    output: int = 0
    usd: float = 0.0

    def add(self, usage: Any, model: str) -> None:
        """Price each message by the model that actually served it (server-side fallback can switch models)."""
        p_in, p_out, p_write, p_read = _prices(model)
        inp, out = usage.input_tokens or 0, usage.output_tokens or 0
        write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        read = getattr(usage, "cache_read_input_tokens", 0) or 0
        self.input += inp
        self.output += out
        self.usd += (inp * p_in + out * p_out + write * p_write + read * p_read) / 1e6


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@dataclass
class Limits:
    daily_messages_per_user: int = 50
    user_daily_budget_usd: float = 1.00
    daily_budget_usd: float = 10.0
    monthly_budget_usd: float = 150.0
    max_tokens: int = 1500
    max_tool_iterations: int = 3


class Assistant:
    def __init__(self, client: AsyncAnthropic, model: str, entropy: EntropyService, limits: Limits | None = None):
        self.client = client
        self.model = model
        self.entropy = entropy
        self.limits = limits or Limits()
        self.store = ConversationStore()
        self._admission = asyncio.Lock()
        self._in_flight: set[str] = set()

    def worst_case_cost(self) -> float:
        p_in, p_out, _, _ = _prices(self.model)
        per_call = (self.limits.max_tokens * p_out + RESERVE_INPUT_TOKENS * p_in) / 1e6
        return round(self.limits.max_tool_iterations * per_call, 6)

    async def _admit(self, user_id: str) -> tuple[int | None, str | None]:
        """Atomically check caps and reserve worst-case cost, so concurrent or abandoned requests can't overspend.

        One stream per user at a time; the reservation row counts toward every cap until it is settled.
        """
        async with self._admission:
            if user_id in self._in_flight:
                return None, "Please wait for the current answer to finish."
            if reason := await self._blocked_reason(user_id):
                return None, reason
            event_id = await run_in_threadpool(db.record_usage, user_id, "assistant_message",
                                               cost_usd=self.worst_case_cost())
            self._in_flight.add(user_id)
            return event_id, None

    async def _blocked_reason(self, user_id: str) -> str | None:
        """Check spend caps before calling the model. Password generation is never affected."""
        lim = self.limits
        if await run_in_threadpool(db.assistant_spend_this_month) >= lim.monthly_budget_usd:
            return "The assistant has reached this month's usage budget."
        if await run_in_threadpool(db.assistant_spend_today) >= lim.daily_budget_usd:
            return "The assistant has reached today's usage budget. Please try again tomorrow."
        if await run_in_threadpool(db.assistant_spend_today, user_id) >= lim.user_daily_budget_usd:
            return "You've reached today's assistant usage limit."
        if await run_in_threadpool(db.assistant_messages_today, user_id) >= lim.daily_messages_per_user:
            return f"You've reached today's limit of {lim.daily_messages_per_user} assistant messages."
        return None

    def _tools(self, user_id: str | None, outbox: list[dict]) -> list:
        entropy = self.entropy
        issued = {"n": 0}

        def _over_limit() -> str | None:
            issued["n"] += 1
            if issued["n"] > MAX_SECRETS_PER_MESSAGE:
                return json.dumps({"error": f"Limit: at most {MAX_SECRETS_PER_MESSAGE} secrets per message."})
            return None

        async def _emit_secret(kind: str, value: str, bits: float, prov: dict, **meta: Any) -> dict:
            sid = secrets.token_urlsafe(8)
            outbox.append({"secret_id": sid, "kind": kind, "value": value, "entropy_bits": round(bits, 2),
                           "provenance": prov, **meta})
            await run_in_threadpool(db.record_usage, user_id, kind, length=meta.get("length") or meta.get("words"),
                                    entropy_bits=bits, sources=prov["sources"], quantum=prov["quantum"],
                                    via_assistant=True)
            return {"secret_id": sid, "shown_to_user": True, "entropy_bits": round(bits, 2),
                    "crack_time_at_1e12_guesses_per_s": crack_time(bits),
                    "sources": prov["sources"], "quantum": prov["quantum"], **meta}

        @beta_async_tool(name="generate_password")
        async def generate_password_tool(length: int = 20, upper: bool = True, lower: bool = True,
                                         digits: bool = True, symbols: bool = True,
                                         exclude_ambiguous: bool = False) -> str:
            """Generate a random password from quantum entropy and show it to the user. Returns metadata only.

            Args:
                length: Number of characters, 8 to 128.
                upper: Include uppercase letters.
                lower: Include lowercase letters.
                digits: Include digits.
                symbols: Include symbols.
                exclude_ambiguous: Leave out look-alike characters such as l, 1, O and 0.
            """
            if err := _over_limit():
                return err
            length = max(8, min(128, int(length)))
            res = await entropy.get_stream(use_pool=False)
            pw, bits = generate_password(res.stream, PasswordOptions(length, upper, lower, digits, symbols,
                                                                     exclude_ambiguous))
            return json.dumps(await _emit_secret("password", pw, bits, res.provenance.as_dict(), length=length))

        @beta_async_tool(name="generate_passphrase")
        async def generate_passphrase_tool(words: int = 6, separator: str = "-", capitalize: bool = False,
                                           add_number: bool = False) -> str:
            """Generate a diceware passphrase (EFF large wordlist) from quantum entropy and show it to the user.

            Args:
                words: Number of words, 4 to 12.
                separator: One of "-", "_", ".", " " or "".
                capitalize: Capitalize each word.
                add_number: Append a random two-digit number.
            """
            if err := _over_limit():
                return err
            words = max(4, min(12, int(words)))
            separator = separator if separator in ("-", "_", ".", " ", "") else "-"
            res = await entropy.get_stream(use_pool=False)
            phrase, bits = generate_passphrase(res.stream, words, separator, capitalize, add_number)
            return json.dumps(await _emit_secret("passphrase", phrase, bits, res.provenance.as_dict(), words=words))

        @beta_async_tool
        async def entropy_status() -> str:
            """Report which quantum entropy sources are online, their health-test state and the IBM pool size."""
            st = entropy.status()
            return json.dumps({"quantum_available": st["quantum_available"], "providers": st["providers"]})

        @beta_async_tool
        async def estimate_crack_time(entropy_bits: float) -> str:
            """Estimate brute-force time for a secret with the given entropy at 10^12 and 10^15 guesses per second.

            Args:
                entropy_bits: Entropy of the secret in bits.
            """
            b = max(0.0, min(1024.0, float(entropy_bits)))
            return json.dumps({"offline_fast_gpu_cluster_1e12": crack_time(b, 1e12),
                               "nation_state_1e15": crack_time(b, 1e15)})

        return [generate_password_tool, generate_passphrase_tool, entropy_status, estimate_crack_time]

    async def chat(self, user_id: str, conv_id: str | None, text: str) -> AsyncIterator[str]:
        event_id, reason = await self._admit(user_id)
        if event_id is None:
            yield _sse("error", {"message": reason})
            yield _sse("done", {})
            return
        usage, completed = TokenUsage(), False
        try:
            conv_id, conv = self.store.get_or_create(conv_id, user_id)
            yield _sse("conversation", {"id": conv_id})
            if conv.turns >= MAX_TURNS:
                yield _sse("error", {"message": "This conversation is full. Start a new chat."})
                completed = True
                return
            conv.turns += 1
            conv.messages.append({"role": "user", "content": text})
            outbox: list[dict] = []
            try:
                async with asyncio.timeout(STREAM_TIMEOUT_S):
                    runner = self.client.beta.messages.tool_runner(
                        model=self.model,
                        max_tokens=self.limits.max_tokens,
                        system=SYSTEM_PROMPT,
                        cache_control={"type": "ephemeral"},  # system + tools + history are re-sent every turn
                        tools=self._tools(user_id, outbox),
                        tool_choice={"type": "auto", "disable_parallel_tool_use": True},
                        messages=list(conv.messages),
                        thinking={"type": "adaptive"},
                        output_config={"effort": "low"},
                        **_fallback_params(self.model),
                        max_iterations=self.limits.max_tool_iterations,
                    )
                    async for message in runner:
                        usage.add(message.usage, getattr(message, "model", self.model))
                        conv.messages.append({"role": "assistant", "content": message.content})
                        for block in message.content:
                            if block.type == "text" and block.text:
                                yield _sse("text", {"text": block.text})
                            elif block.type == "tool_use":
                                yield _sse("tool", {"name": block.name})
                        if message.stop_reason == "refusal":
                            yield _sse("error", {"message": "The assistant can't help with that request."})
                            break
                        tool_response = await runner.generate_tool_call_response()
                        for item in outbox:
                            yield _sse("secret", item)
                        outbox.clear()
                        if tool_response is not None:
                            conv.messages.append(tool_response)
                completed = True
            except asyncio.CancelledError:
                raise
            except Exception as e:  # surface a friendly error; details stay in server logs
                log.exception("assistant error")
                yield _sse("error", {"message": f"Assistant unavailable ({e.__class__.__name__})."})
            yield _sse("done", {})
        finally:
            # Shielded so a client disconnect can't skip settlement. Failed or cancelled runs keep the
            # worst-case reservation (they may have been billed); successful runs record the real cost.
            reserved = self.worst_case_cost()
            cost = round(usage.usd, 6) if completed else max(round(usage.usd, 6), reserved)
            self._in_flight.discard(user_id)
            with anyio.CancelScope(shield=True):
                await run_in_threadpool(db.update_usage_cost, event_id, usage.input, usage.output, cost)
