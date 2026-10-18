"""Drives the real Anthropic SDK tool runner against a mocked Messages API."""

import json

import httpx2
import pytest
from anthropic import AsyncAnthropic
from fastapi.testclient import TestClient

from app.assistant.agent import Assistant, crack_time
from app.config import get_settings
from app.entropy.service import EntropyService
from app.main import create_app
from tests.conftest import FakeProvider


class FakeAPI:
    """Mock transport for the Anthropic SDK (which uses httpx2): replays canned responses, records requests."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[dict] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(json.loads(request.content))
        status, body = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        return httpx2.Response(status, json=body)


def msg(content, stop_reason):
    return {"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
            "content": content, "stop_reason": stop_reason, "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 10}}


def parse_sse(text):
    events = []
    for chunk in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in chunk.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def make_app(api: FakeAPI) -> TestClient:
    entropy = EntropyService([FakeProvider("lfd")])
    http = httpx2.AsyncClient(transport=httpx2.MockTransport(api))
    assistant = Assistant(AsyncAnthropic(api_key="test", max_retries=0, http_client=http), "claude-opus-5-5", entropy)
    return TestClient(create_app(settings=get_settings(), entropy=entropy, assistant=assistant))


def test_assistant_generates_password_without_seeing_it():
    api = FakeAPI(
        (200, msg([
            {"type": "text", "text": "Generating one now."},
            {"type": "tool_use", "id": "tu_1", "name": "generate_password", "input": {"length": 24}},
        ], "tool_use")),
        (200, msg([{"type": "text", "text": "Done — 24 characters above."}], "end_turn")),
    )
    with make_app(api) as app_client:
        r = app_client.post("/api/v2/assistant/chat", json={"message": "make me a bank password"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(r.text)
    kinds = [e for e, _ in events]
    assert kinds == ["conversation", "text", "tool", "secret", "text", "done"]
    secret = next(d for e, d in events if e == "secret")
    assert len(secret["value"]) == 24 and secret["provenance"]["quantum"]

    # The model saw metadata only — the password never left the server towards Anthropic.
    first, second = api.requests
    assert secret["value"] not in json.dumps(second)
    tool_result = second["messages"][-1]["content"][0]
    assert tool_result["type"] == "tool_result"
    assert json.loads(tool_result["content"][0]["text"] if isinstance(tool_result["content"], list)
                      else tool_result["content"])["secret_id"] == secret["secret_id"]
    assert first["model"] == "claude-opus-5-5" and first["thinking"] == {"type": "adaptive"}
    assert {t["name"] for t in first["tools"]} == {"generate_password", "generate_passphrase", "entropy_status",
                                                   "estimate_crack_time"}


def test_conversation_history_is_kept_server_side():
    api = FakeAPI((200, msg([{"type": "text", "text": "Hi!"}], "end_turn")))
    with make_app(api) as app_client:
        first = parse_sse(app_client.post("/api/v2/assistant/chat", json={"message": "hello"}).text)
        conv_id = first[0][1]["id"]
        app_client.post("/api/v2/assistant/chat", json={"message": "again", "conversation_id": conv_id})
    sent = api.requests[-1]["messages"]
    assert [m["role"] for m in sent] == ["user", "assistant", "user"]


def test_assistant_api_errors_are_friendly():
    api = FakeAPI((500, {"type": "error", "error": {"type": "api_error", "message": "boom"}}))
    with make_app(api) as app_client:
        events = parse_sse(app_client.post("/api/v2/assistant/chat", json={"message": "hi"}).text)
    assert events[-2][0] == "error" and events[-1][0] == "done"


def test_message_validation():
    with make_app(FakeAPI((200, {}))) as app_client:
        assert app_client.post("/api/v2/assistant/chat", json={"message": ""}).status_code == 422
        assert app_client.post("/api/v2/assistant/chat", json={"message": "x" * 2001}).status_code == 422


def test_assistant_disabled_without_key():
    with TestClient(create_app(settings=get_settings(), entropy=EntropyService([]))) as c:
        assert c.post("/api/v2/assistant/chat", json={"message": "hi"}).status_code == 503


def test_crack_time():
    assert crack_time(10) == "instantly"
    assert "years" in crack_time(128)


def make_limited_app(api: FakeAPI, limits) -> TestClient:
    entropy = EntropyService([FakeProvider("lfd")])
    http = httpx2.AsyncClient(transport=httpx2.MockTransport(api))
    assistant = Assistant(AsyncAnthropic(api_key="test", max_retries=0, http_client=http), "claude-opus-5-5", entropy,
                          limits)
    return TestClient(create_app(settings=get_settings(), entropy=entropy, assistant=assistant))


def test_usage_cost_is_recorded_and_caching_requested():
    from sqlmodel import Session, select

    from app import db

    body = msg([{"type": "text", "text": "Hi"}], "end_turn")
    body["usage"] = {"input_tokens": 1000, "output_tokens": 500, "cache_read_input_tokens": 2000,
                     "cache_creation_input_tokens": 0}
    api = FakeAPI((200, body))
    with make_app(api) as c:
        c.post("/api/v2/assistant/chat", json={"message": "hi"})
    assert api.requests[0]["cache_control"] == {"type": "ephemeral"}
    with Session(db.engine()) as s:
        ev = s.exec(select(db.UsageEvent).where(db.UsageEvent.kind == "assistant_message")).one()
    # 1000*$4 + 500*$20 + 2000*$0.20 per MTok
    assert ev.cost_usd == pytest.approx((4000 + 10000 + 400) / 1e6)
    assert ev.input_tokens == 1000 and ev.output_tokens == 500


def test_per_user_daily_message_cap():
    from app.assistant.agent import Limits

    api = FakeAPI((200, msg([{"type": "text", "text": "Hi"}], "end_turn")))
    with make_limited_app(api, Limits(daily_messages_per_user=2)) as c:
        for _ in range(2):
            c.post("/api/v2/assistant/chat", json={"message": "hi"})
        events = parse_sse(c.post("/api/v2/assistant/chat", json={"message": "hi"}).text)
    assert len(api.requests) == 2
    assert events[1][0] == "error" and "limit of 2" in events[1][1]["message"]


def test_global_budget_kill_switch():
    from app import db
    from app.assistant.agent import Limits

    api = FakeAPI((200, msg([{"type": "text", "text": "Hi"}], "end_turn")))
    with make_limited_app(api, Limits(daily_budget_usd=1.0)) as c:
        db.record_usage("someone_else", "assistant_message", cost_usd=1.5)
        events = parse_sse(c.post("/api/v2/assistant/chat", json={"message": "hi"}).text)
    assert api.requests == []  # never reached Anthropic
    assert "budget" in events[1][1]["message"]


def test_per_user_dollar_cap():
    from app import db
    from app.assistant.agent import Limits

    api = FakeAPI((200, msg([{"type": "text", "text": "Hi"}], "end_turn")))
    with make_limited_app(api, Limits(user_daily_budget_usd=0.10)) as c:
        db.record_usage("dev_local", "assistant_message", cost_usd=0.11)
        events = parse_sse(c.post("/api/v2/assistant/chat", json={"message": "hi"}).text)
    assert api.requests == [] and "usage limit" in events[1][1]["message"]


def test_monthly_budget_cap():
    from app import db
    from app.assistant.agent import Limits

    api = FakeAPI((200, msg([{"type": "text", "text": "Hi"}], "end_turn")))
    with make_limited_app(api, Limits(monthly_budget_usd=5.0, daily_budget_usd=100.0)) as c:
        db.record_usage("x", "assistant_message", cost_usd=5.0)
        events = parse_sse(c.post("/api/v2/assistant/chat", json={"message": "hi"}).text)
    assert api.requests == [] and "month" in events[1][1]["message"]
