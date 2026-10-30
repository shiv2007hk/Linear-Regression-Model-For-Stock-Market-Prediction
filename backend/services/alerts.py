from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ml.data_loader import MarketDataError, load_market_data
from models.entities import AlertEvent, PredictionHistory, UserAlert
from services.runtime_state import runtime_state
from utils import iso_utc, normalize_ticker, safe_round

ALERT_TYPES = {
    "price_change_pct": "Absolute daily price change exceeds a percentage threshold",
    "forecast_error_pct": "A resolved forecast's absolute percentage error exceeds a threshold",
    "data_refresh_failure": "A market-data refresh failed in the last 24 hours",
    "new_actual_observation": "A saved prediction was resolved by a new actual observation",
}


def serialize_alert(alert: UserAlert) -> dict[str, Any]:
    return {
        "id": alert.id,
        "ticker": alert.ticker,
        "alert_type": alert.alert_type,
        "threshold": safe_round(alert.threshold, 4),
        "enabled": alert.enabled,
        "created_ts": iso_utc(alert.created_ts),
    }


def serialize_event(event: AlertEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "alert_id": event.alert_id,
        "ticker": event.ticker,
        "alert_type": event.alert_type,
        "message": event.message,
        "created_ts": iso_utc(event.created_ts),
    }


def list_alerts(db: Session) -> dict[str, Any]:
    alerts = db.execute(select(UserAlert).order_by(UserAlert.created_ts.desc())).scalars().all()
    events = db.execute(select(AlertEvent).order_by(AlertEvent.created_ts.desc()).limit(25)).scalars().all()
    return {
        "alerts": [serialize_alert(a) for a in alerts],
        "events": [serialize_event(e) for e in events],
        "alert_types": [{"type": k, "description": v} for k, v in ALERT_TYPES.items()],
        "scheduling_note": (
            "Alerts are evaluated in-app whenever you open the Prediction Journal or click 'Check alerts'. "
            "No background scheduler or email delivery is configured."
        ),
    }


def create_alert(db: Session, alert_type: str, ticker: str | None, threshold: float | None) -> dict[str, Any]:
    if alert_type not in ALERT_TYPES:
        raise ValueError(f"Unknown alert type. Choose one of: {', '.join(ALERT_TYPES)}.")
    normalized = normalize_ticker(ticker) if ticker else None
    if alert_type in {"price_change_pct", "forecast_error_pct"} and threshold is None:
        raise ValueError("A threshold is required for this alert type.")
    if threshold is not None and threshold <= 0:
        raise ValueError("Threshold must be a positive number.")
    alert = UserAlert(ticker=normalized, alert_type=alert_type, threshold=threshold, enabled=True)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return serialize_alert(alert)


def toggle_alert(db: Session, alert_id: int, enabled: bool) -> dict[str, Any]:
    alert = db.get(UserAlert, alert_id)
    if not alert:
        raise LookupError("Alert not found.")
    alert.enabled = enabled
    db.commit()
    return serialize_alert(alert)


def delete_alert(db: Session, alert_id: int) -> None:
    alert = db.get(UserAlert, alert_id)
    if not alert:
        raise LookupError("Alert not found.")
    db.delete(alert)
    db.commit()


def _add_event(
    db: Session,
    events: list[AlertEvent],
    seen: set[str],
    alert: UserAlert,
    ticker: str | None,
    message: str,
    dedupe_key: str,
) -> None:
    if dedupe_key in seen:
        return
    seen.add(dedupe_key)
    exists = db.execute(select(AlertEvent.id).where(AlertEvent.dedupe_key == dedupe_key)).first()
    if exists:
        return
    event = AlertEvent(
        alert_id=alert.id,
        ticker=ticker,
        alert_type=alert.alert_type,
        message=message,
        dedupe_key=dedupe_key,
    )
    db.add(event)
    events.append(event)


def evaluate_alerts(db: Session, default_ticker: str) -> dict[str, Any]:
    alerts = db.execute(select(UserAlert).where(UserAlert.enabled.is_(True))).scalars().all()
    now = datetime.now(timezone.utc)
    created: list[Any] = []
    seen: set[str] = set()

    today = now.date().isoformat()
    price_cache: dict[str, tuple[float, float, str] | None] = {}

    for alert in alerts:
        ticker = alert.ticker or default_ticker
        if alert.alert_type == "price_change_pct":
            if ticker not in price_cache:
                try:
                    data = load_market_data(ticker, period="5d")
                    close = data.df["Close"].astype(float)
                    change_pct = float((close.iloc[-1] / close.iloc[-2] - 1) * 100)
                    price_cache[ticker] = (float(close.iloc[-1]), change_pct, data.df.index[-1].strftime("%Y-%m-%d"))
                except MarketDataError:
                    price_cache[ticker] = None
            quote = price_cache[ticker]
            if quote and abs(quote[1]) >= (alert.threshold or 0):
                _add_event(
                    db, created, seen, alert, ticker,
                    f"{ticker} moved {quote[1]:+.2f}% on {quote[2]} (threshold {alert.threshold:.2f}%).",
                    f"{alert.id}:price:{ticker}:{quote[2]}",
                )
        elif alert.alert_type == "forecast_error_pct":
            stmt = select(PredictionHistory).where(PredictionHistory.percentage_error.isnot(None))
            if alert.ticker:
                stmt = stmt.where(PredictionHistory.ticker == alert.ticker)
            stmt = stmt.order_by(PredictionHistory.resolved_at.desc()).limit(10)
            preds = db.execute(stmt).scalars().all()
            for p in preds:
                if p.percentage_error is not None and p.percentage_error >= (alert.threshold or 0):
                    _add_event(
                        db, created, seen, alert, p.ticker,
                        f"Forecast for {p.ticker} on {p.base_date} missed by {p.percentage_error:.2f}% (threshold {alert.threshold:.2f}%).",
                        f"{alert.id}:fcerr:{p.id}",
                    )
        elif alert.alert_type == "data_refresh_failure":
            error = runtime_state.last_fetch_error
            if error and error.get("ts"):
                error_ts = datetime.fromisoformat(error["ts"])
                if now - error_ts <= timedelta(hours=24):
                    _add_event(
                        db, created, seen, alert, error.get("ticker"),
                        f"Market data refresh failed for {error.get('ticker')}: {error.get('message')}",
                        f"{alert.id}:refresh:{error_ts.date().isoformat()}:{error.get('ticker')}",
                    )
        elif alert.alert_type == "new_actual_observation":
            stmt = select(PredictionHistory).where(PredictionHistory.resolved_at.isnot(None))
            if alert.ticker:
                stmt = stmt.where(PredictionHistory.ticker == alert.ticker)
            stmt = stmt.order_by(PredictionHistory.resolved_at.desc()).limit(20)
            preds = db.execute(stmt).scalars().all()
            for p in preds:
                if p.resolved_at and now - p.resolved_at.replace(tzinfo=timezone.utc) <= timedelta(hours=24):
                    _add_event(
                        db, created, seen, alert, p.ticker,
                        f"New actual observation for {p.ticker} on the forecast after {p.base_date}: "
                        f"actual {p.actual_price:.2f} vs predicted {p.predicted_price:.2f}.",
                        f"{alert.id}:resolved:{p.id}",
                    )

    db.commit()
    return {
        "checked": len(alerts),
        "new_events": [serialize_event(e) for e in created],
        "evaluated_at": iso_utc(now),
    }
