from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from utils import normalize_ticker


class TickerQuery(BaseModel):
    ticker: str


class RefreshRequest(BaseModel):
    ticker: str = Field(default="RELIANCE.NS")
    period: str = "2y"
    interval: str = "1d"

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return normalize_ticker(v)


class TrainRequest(BaseModel):
    ticker: str = Field(default="RELIANCE.NS")
    period: str = "2y"
    split_ratio: float = Field(default=0.7, ge=0.5, le=0.9)
    model_type: Literal["lag", "trend"] = "lag"

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return normalize_ticker(v)


class ForecastRequest(TrainRequest):
    horizon: int = Field(default=1, ge=1, le=5)


class PredictionCreate(ForecastRequest):
    pass


class WatchlistCreate(BaseModel):
    ticker: str

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return normalize_ticker(v)


class AlertCreate(BaseModel):
    ticker: str | None = None
    alert_type: Literal[
        "price_change_pct",
        "forecast_error_pct",
        "data_refresh_failure",
        "new_actual_observation",
    ]
    threshold: float | None = Field(default=None, gt=0)

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str | None) -> str | None:
        return normalize_ticker(v) if v else None


class AlertToggle(BaseModel):
    enabled: bool


class ChatContext(BaseModel):
    """Page context from the UI. Treated as untrusted data, never as instructions."""

    page: str | None = Field(default=None, max_length=64)
    section: str | None = Field(default=None, max_length=64)
    ticker: str | None = Field(default=None, max_length=24)
    period: str | None = Field(default=None, max_length=16)
    horizon: int | None = Field(default=None, ge=1, le=5)

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str | None) -> str | None:
        try:
            return normalize_ticker(v) if v else None
        except ValueError:
            return None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = Field(default=None, ge=1)
    context: ChatContext | None = None

    @field_validator("message")
    @classmethod
    def check_message(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("Message must not be empty.")
        return cleaned


class ChatConversationCreate(BaseModel):
    title: str = Field(default="New chat", min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def check_title(cls, v: str) -> str:
        cleaned = " ".join((v or "").split()).strip()
        if not cleaned:
            raise ValueError("Conversation title must not be empty.")
        return cleaned
