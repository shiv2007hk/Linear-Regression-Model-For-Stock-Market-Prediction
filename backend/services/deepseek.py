"""DeepSeek HTTP client for the AI Copilot: configuration gate, error vocabulary, rate limiting.

Nothing in this module invents an answer. If no key is configured the calls raise
``ChatError('chat_not_configured')`` and the API surfaces that as a real error — there is no
simulated assistant anywhere in here.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

COMPLETIONS_PATH = "/chat/completions"
MAX_ERROR_BODY_CHARACTERS = 300

# The chat error vocabulary. Every value is returned as {"error": {"code", "message"}}.
DEFAULT_STATUS = {
    "chat_not_configured": 503,
    "chat_auth": 502,
    "chat_rate_limited": 429,
    "chat_unavailable": 503,
    "chat_upstream_error": 502,
    "chat_invalid_response": 502,
    "chat_empty_response": 502,
    "chat_tool_rounds_exhausted": 502,
    "chat_conversation_not_found": 404,
    "chat_request_invalid": 422,
    "internal_error": 500,
}


class ChatError(Exception):
    """A chat failure with a stable code, an honest message and an HTTP status."""

    def __init__(self, message: str, code: str = "chat_upstream_error", status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status if status is not None else DEFAULT_STATUS.get(code, 502)

    def payload(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message}}


def settings() -> Any:
    return get_settings()


def is_configured() -> bool:
    """True only when a real DeepSeek key is present in the environment."""
    return bool(get_settings().effective_deepseek_api_key)


def api_key() -> str:
    key = get_settings().effective_deepseek_api_key
    if not key:
        raise ChatError(
            "The AI Copilot is not configured: no DeepSeek API key is present. Set "
            "DEEPSEEK_API_KEY (or STOCKSENSE_DEEPSEEK_API_KEY) in the backend environment and restart. "
            "No reply was generated, because this product never fabricates one.",
            code="chat_not_configured",
            status=503,
        )
    return key


def completions_url() -> str:
    base = (get_settings().deepseek_base_url or "https://api.deepseek.com").strip().rstrip("/")
    return f"{base}{COMPLETIONS_PATH}"


def model_name() -> str:
    return get_settings().deepseek_model


def _headers(accept: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key()}",
        "Content-Type": "application/json",
        "Accept": accept,
    }


def _timeout() -> httpx.Timeout:
    budget = float(get_settings().deepseek_timeout_seconds)
    return httpx.Timeout(budget, connect=min(15.0, budget), read=budget)


def _client_factory(**kwargs: Any) -> httpx.AsyncClient:
    """Single seam for outbound client creation, so tests can inject a mock transport."""
    return httpx.AsyncClient(**kwargs)


def _redact(text: str) -> str:
    """Never let the key or a bearer token escape into a message or a log line."""
    cleaned = text or ""
    key = get_settings().effective_deepseek_api_key
    if key and key in cleaned:
        cleaned = cleaned.replace(key, "[redacted-api-key]")
    cleaned = re.sub(r"(?i)bearer\s+[^\s,;'\"]+", "Bearer [redacted]", cleaned)
    return cleaned.strip()[:MAX_ERROR_BODY_CHARACTERS]


def _describe_upstream(response: httpx.Response, body: str) -> ChatError:
    status = response.status_code
    detail = _redact(body)
    if status in (401, 403):
        return ChatError(
            "DeepSeek rejected the configured API key (HTTP " + str(status) + "). "
            "Check the key and the account's access to the chat-completions endpoint.",
            code="chat_auth",
            status=502,
        )
    if status == 429:
        return ChatError(
            "DeepSeek rate-limited this request (HTTP 429)"
            + (f": {detail}" if detail else "")
            + ". Wait a moment and ask again.",
            code="chat_rate_limited",
            status=429,
        )
    return ChatError(
        f"DeepSeek returned HTTP {status}" + (f": {detail}" if detail else "."),
        code="chat_upstream_error",
        status=502,
    )


class SlidingWindowLimiter:
    """Small in-process limiter, in the spirit of services.cache.TTLCache."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, list[float]] = {}

    def check(self, key: str) -> None:
        cfg = get_settings()
        limit = int(getattr(cfg, "chat_rate_limit_requests", 30))
        window = float(getattr(cfg, "chat_rate_limit_window_seconds", 60))
        if limit <= 0:
            return
        now = time.monotonic()
        with self._lock:
            stamps = [stamp for stamp in self._hits.get(key, []) if now - stamp < window]
            if len(stamps) >= limit:
                retry_after = max(0.0, window - (now - stamps[0]))
                self._hits[key] = stamps
                raise ChatError(
                    f"Too many Copilot requests from this client: {limit} per {int(window)}s window. "
                    f"Try again in {retry_after:.0f}s.",
                    code="chat_rate_limited",
                    status=429,
                )
            stamps.append(now)
            self._hits[key] = stamps

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def _stream_payload(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, Any]:
    cfg = get_settings()
    payload: dict[str, Any] = {
        "model": cfg.deepseek_model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        "temperature": cfg.deepseek_temperature,
        "max_tokens": cfg.deepseek_max_output_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    return payload


def _complete_payload(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, Any]:
    payload = _stream_payload(messages, tools)
    payload["stream"] = False
    payload.pop("stream_options", None)
    return payload


async def stream_completion(
    messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
) -> AsyncIterator[dict[str, Any]]:
    """POST /chat/completions with stream=true and yield each upstream chunk dict."""
    api_key()  # fails fast with chat_not_configured when the Copilot has no credential
    cfg = get_settings()
    payload = _stream_payload(messages, tools)
    try:
        async with _client_factory(timeout=_timeout()) as client:
            async with client.stream(
                "POST", completions_url(), json=payload, headers=_headers("text/event-stream")
            ) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode("utf-8", "replace")
                    raise _describe_upstream(response, body)
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        logger.warning("Ignoring malformed DeepSeek stream frame")
                        continue
                    if isinstance(chunk, dict):
                        yield chunk
    except httpx.TimeoutException as exc:
        raise ChatError(
            f"DeepSeek did not respond within {int(cfg.deepseek_timeout_seconds)}s. The Copilot is unavailable "
            "right now; no answer was fabricated.",
            code="chat_unavailable",
            status=503,
        ) from exc
    except httpx.HTTPError as exc:
        raise ChatError(
            f"Could not reach DeepSeek ({type(exc).__name__}). The Copilot is unavailable right now; "
            "no answer was fabricated.",
            code="chat_unavailable",
            status=503,
        ) from exc


async def create_completion(
    messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    """POST /chat/completions without streaming and return the decoded response."""
    cfg = get_settings()
    payload = _complete_payload(messages, tools)
    try:
        async with _client_factory(timeout=_timeout()) as client:
            response = await client.post(
                completions_url(), json=payload, headers=_headers("application/json")
            )
    except httpx.TimeoutException as exc:
        raise ChatError(
            f"DeepSeek did not respond within {int(cfg.deepseek_timeout_seconds)}s. The Copilot is unavailable "
            "right now; no answer was fabricated.",
            code="chat_unavailable",
            status=503,
        ) from exc
    except httpx.HTTPError as exc:
        raise ChatError(
            f"Could not reach DeepSeek ({type(exc).__name__}). The Copilot is unavailable right now; "
            "no answer was fabricated.",
            code="chat_unavailable",
            status=503,
        ) from exc

    if response.status_code >= 400:
        raise _describe_upstream(response, response.text)
    try:
        data = response.json()
    except (json.JSONDecodeError, ValueError) as exc:
        raise ChatError(
            "DeepSeek returned a response that is not valid JSON.", code="chat_invalid_response", status=502
        ) from exc
    if not isinstance(data, dict):
        raise ChatError("DeepSeek returned an unexpected payload.", code="chat_invalid_response", status=502)
    return data


def chunks_from_completion(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Re-shape a non-streaming response as one stream-style chunk so both paths share one loop."""
    choices: list[dict[str, Any]] = []
    for choice in data.get("choices") or []:
        message = choice.get("message") or {}
        choices.append(
            {
                "delta": {
                    "role": message.get("role", "assistant"),
                    "content": message.get("content"),
                    "tool_calls": message.get("tool_calls"),
                },
                "finish_reason": choice.get("finish_reason", "stop"),
            }
        )
    chunk: dict[str, Any] = {"choices": choices or []}
    if data.get("usage"):
        chunk["usage"] = data["usage"]
    return [chunk]
