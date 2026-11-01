"""StockSense AI Copilot endpoints: honest status, SSE streaming, JSON replies, conversations.

Error vocabulary — every failure leaves this router as {"error": {"code", "message"}}:

* chat_not_configured (503)  — no DeepSeek key. Nothing is simulated.
* chat_auth (502)            — DeepSeek rejected the configured key.
* chat_rate_limited (429)    — local sliding-window limit, or an upstream 429.
* chat_unavailable (503)     — DeepSeek timed out or could not be reached.
* chat_upstream_error (502)  — any other non-2xx from DeepSeek.
* chat_invalid_response (502)— DeepSeek replied with something that is not JSON.
* chat_empty_response (502)  — DeepSeek replied with neither text nor a tool call.
* chat_tool_rounds_exhausted (502) — the model kept asking for tools without answering.
* chat_conversation_not_found (404)
* chat_request_invalid (422)
* tool_not_allowed / tool_arguments_invalid / tool_data_unavailable / tool_execution_failed
  — these arrive inside SSE "tool" frames and tool rows, never as HTTP status codes.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from config import get_settings
from database.session import get_db
from schemas.requests import ChatConversationCreate, ChatRequest
from services import chat, deepseek
from services.chat_tools import tool_catalog
from services.deepseek import limiter
from utils import iso_utc, jsonable

router = APIRouter(prefix="/api/chat", tags=["ai-copilot"])

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = getattr(request, "client", None)
    return (getattr(client, "host", None) or "anonymous") if client else "anonymous"


def _context(payload: ChatRequest) -> dict[str, Any] | None:
    return payload.context.model_dump(exclude_none=True) if payload.context else None


@router.get("/status")
def status() -> dict[str, Any]:
    """Whether the Copilot can answer at all. Never exposes the key or any part of it."""
    configured = deepseek.is_configured()
    settings = get_settings()
    reason = (
        None
        if configured
        else (
            "No DeepSeek API key is configured. Set DEEPSEEK_API_KEY or "
            "STOCKSENSE_DEEPSEEK_API_KEY in the backend environment and restart. "
            "The Copilot is disabled rather than simulated: it never returns an invented reply."
        )
    )
    return jsonable(
        {
            "configured": configured,
            "available": configured,
            "enabled": True,
            "model": settings.deepseek_model,
            "base_url": settings.deepseek_base_url,
            "reason": reason,
            "streaming": True,
            "tools": tool_catalog(),
            "limits": {
                "timeout_seconds": settings.deepseek_timeout_seconds,
                "max_output_tokens": settings.deepseek_max_output_tokens,
                "rate_limit_requests": settings.chat_rate_limit_requests,
                "rate_limit_window_seconds": settings.chat_rate_limit_window_seconds,
                "history_messages": settings.chat_max_history_messages,
                "tool_rounds": settings.chat_max_tool_rounds,
            },
            "endpoints": {
                "stream": "/api/chat/stream",
                "complete": "/api/chat",
                "conversations": "/api/chat/conversations",
            },
            "disclaimer": "Educational analytics. The predictive model is Simple Linear Regression on the "
            "previous close. Not investment advice.",
        }
    )


@router.post("/stream")
async def stream(
    payload: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Relay DeepSeek's token stream as Server-Sent Events (start, token, tool, done, error).

    Configuration and rate-limit failures answer with a real HTTP status and the JSON error
    envelope before any SSE bytes are sent; failures that happen mid-stream arrive as an
    `error` event because the response is already streaming.
    """
    limiter.check(_client_key(request))
    deepseek.api_key()

    context = _context(payload)
    conversation = chat.open_conversation(db, payload.conversation_id, context=context, title_hint=payload.message)
    history, dropped = chat.bounded_history(db, conversation.id)
    user_message = chat.record_message(db, conversation, role="user", content=payload.message)

    return StreamingResponse(
        chat.sse_stream(
            conversation_id=conversation.id,
            user_message_id=user_message.id,
            history=history,
            user_text=payload.message,
            context=context,
            history_dropped=dropped,
        ),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.post("")
async def complete(
    payload: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Non-streaming Copilot turn: same tools, same prompt, one JSON reply."""
    limiter.check(_client_key(request))
    deepseek.api_key()

    context = _context(payload)
    conversation = chat.open_conversation(db, payload.conversation_id, context=context, title_hint=payload.message)
    history, dropped = chat.bounded_history(db, conversation.id)
    chat.record_message(db, conversation, role="user", content=payload.message)

    result = await chat.complete(history=history, user_text=payload.message, context=context)
    assistant = chat.record_message(
        db,
        conversation,
        role="assistant",
        content=result["reply"],
        tool_calls=result["tool_calls"] or None,
        usage=result["usage"],
    )

    return jsonable(
        {
            "conversation_id": conversation.id,
            "message_id": assistant.id,
            "reply": result["reply"],
            "model": result["model"],
            "finish_reason": result["finish_reason"],
            "tool_rounds": result["tool_rounds"],
            "tool_calls": result["tool_calls"],
            "usage": result["usage"],
            "history_messages": len(history),
            "history_dropped": dropped,
            "created_ts": iso_utc(assistant.created_ts),
            "disclaimer": "Generated by the StockSense AI Copilot from this application's own data. "
            "Educational only, not investment advice.",
        }
    )


@router.get("/conversations")
def conversations(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return jsonable(chat.list_conversations(db, limit=limit))


@router.post("/conversations", status_code=201)
def create_conversation(
    payload: ChatConversationCreate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return jsonable({"conversation": chat.create_conversation(db, payload.title)})


@router.get("/conversations/{conversation_id}")
def conversation_detail(conversation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return jsonable(chat.get_conversation(db, conversation_id))


@router.delete("/conversations/{conversation_id}", status_code=204)
def remove_conversation(conversation_id: int, db: Session = Depends(get_db)) -> None:
    chat.delete_conversation(db, conversation_id)
