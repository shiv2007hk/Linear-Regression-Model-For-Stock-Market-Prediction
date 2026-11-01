from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class StockData(Base):
    __tablename__ = "stock_data"
    __table_args__ = (
        UniqueConstraint("ticker", "date", name="uq_stock_ticker_date"),
        Index("ix_stock_ticker_date", "ticker", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(24), nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String(8))
    retrieval_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ModelRun(Base):
    __tablename__ = "model_runs"
    __table_args__ = (Index("ix_model_runs_ticker_ts", "ticker", "training_ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(24), nullable=False)
    model_type: Mapped[str] = mapped_column(String(32), nullable=False)
    train_start: Mapped[str] = mapped_column(String(10))
    train_end: Mapped[str] = mapped_column(String(10))
    test_start: Mapped[str] = mapped_column(String(10))
    test_end: Mapped[str] = mapped_column(String(10))
    intercept: Mapped[float] = mapped_column(Float)
    slope: Mapped[float] = mapped_column(Float)
    mae: Mapped[float | None] = mapped_column(Float)
    mse: Mapped[float | None] = mapped_column(Float)
    rmse: Mapped[float | None] = mapped_column(Float)
    r2: Mapped[float | None] = mapped_column(Float)
    mape: Mapped[float | None] = mapped_column(Float)
    directional_accuracy: Mapped[float | None] = mapped_column(Float)
    baseline_mae: Mapped[float | None] = mapped_column(Float)
    train_size: Mapped[int] = mapped_column(Integer)
    test_size: Mapped[int] = mapped_column(Integer)
    split_ratio: Mapped[float] = mapped_column(Float)
    training_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PredictionHistory(Base):
    __tablename__ = "prediction_history"
    __table_args__ = (Index("ix_pred_ticker_ts", "ticker", "prediction_ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(24), nullable=False)
    model_run_id: Mapped[int | None] = mapped_column(ForeignKey("model_runs.id", ondelete="SET NULL"))
    base_date: Mapped[str] = mapped_column(String(10))
    input_price: Mapped[float] = mapped_column(Float)
    predicted_price: Mapped[float] = mapped_column(Float)
    predicted_change_pct: Mapped[float | None] = mapped_column(Float)
    forecast_date: Mapped[str | None] = mapped_column(String(10))
    forecast_date_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    intercept: Mapped[float] = mapped_column(Float)
    slope: Mapped[float] = mapped_column(Float)
    train_start: Mapped[str | None] = mapped_column(String(10))
    train_end: Mapped[str | None] = mapped_column(String(10))
    test_mae: Mapped[float | None] = mapped_column(Float)
    test_rmse: Mapped[float | None] = mapped_column(Float)
    test_r2: Mapped[float | None] = mapped_column(Float)
    test_mape: Mapped[float | None] = mapped_column(Float)
    prediction_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    actual_price: Mapped[float | None] = mapped_column(Float)
    absolute_error: Mapped[float | None] = mapped_column(Float)
    percentage_error: Mapped[float | None] = mapped_column(Float)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    model_run: Mapped[ModelRun | None] = relationship()


class WatchlistItem(Base):
    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("ticker", name="uq_watchlist_ticker"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(24), nullable=False)
    date_added: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserAlert(Base):
    __tablename__ = "user_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str | None] = mapped_column(String(24))
    alert_type: Mapped[str] = mapped_column(String(32), nullable=False)
    threshold: Mapped[float | None] = mapped_column(Float)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AlertEvent(Base):
    __tablename__ = "alert_events"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_alert_dedupe"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("user_alerts.id", ondelete="CASCADE"))
    ticker: Mapped[str | None] = mapped_column(String(24))
    alert_type: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(String(512), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    __table_args__ = (Index("ix_chat_conversations_updated", "updated_ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="New chat")
    model: Mapped[str | None] = mapped_column(String(64))
    page: Mapped[str | None] = mapped_column(String(64))
    ticker: Mapped[str | None] = mapped_column(String(24))
    created_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", passive_deletes=True
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_conversation_ts", "conversation_id", "created_ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False
    )
    # user | assistant | tool. Only user and assistant rows are replayed upstream.
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tool_name: Mapped[str | None] = mapped_column(String(48))
    tool_calls: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(64))
    # Set when a turn failed (chat_not_configured, chat_auth, tool_not_allowed, ...).
    error_code: Mapped[str | None] = mapped_column(String(48))
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    created_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    conversation: Mapped[ChatConversation] = relationship(back_populates="messages")
