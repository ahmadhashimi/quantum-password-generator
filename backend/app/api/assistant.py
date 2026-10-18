from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..auth import CurrentUser, require_user
from ..ratelimit import assistant_limit, limiter

router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = Field(default=None, max_length=64)


def _assistant(request: Request):
    a = getattr(request.app.state, "assistant", None)
    if a is None:
        raise HTTPException(503, "Assistant is not configured")
    return a


@router.post("/api/v2/assistant/chat")
@limiter.limit(assistant_limit)
async def chat(request: Request, body: ChatRequest, user: Annotated[CurrentUser, Depends(require_user)]):
    assistant = _assistant(request)
    return StreamingResponse(assistant.chat(user.id, body.conversation_id, body.message),
                             media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no"})


@router.delete("/api/v2/assistant/conversations/{conv_id}")
@limiter.limit(assistant_limit)
async def delete_conversation(request: Request, conv_id: str, user: Annotated[CurrentUser, Depends(require_user)]):
    _assistant(request).store.delete(conv_id, user.id)
    return {"ok": True}
