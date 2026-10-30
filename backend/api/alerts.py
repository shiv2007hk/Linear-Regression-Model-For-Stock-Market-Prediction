from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from config import get_settings
from database.session import get_db
from schemas.requests import AlertCreate, AlertToggle
from services.alerts import (
    create_alert,
    delete_alert,
    evaluate_alerts,
    list_alerts,
    toggle_alert,
)
from services.predictions import resolve_pending
from utils import jsonable

router = APIRouter(prefix="/api/alerts", tags=["alerts"])
settings = get_settings()


@router.get("")
def get_alerts(db: Session = Depends(get_db)) -> dict[str, Any]:
    return jsonable(list_alerts(db))


@router.post("", status_code=201)
def add_alert(payload: AlertCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    alert = create_alert(db, payload.alert_type, payload.ticker, payload.threshold)
    return jsonable({"alert": alert, "message": "Alert created."})


@router.patch("/{alert_id}")
def patch_alert(alert_id: int, payload: AlertToggle, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        alert = toggle_alert(db, alert_id, payload.enabled)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": str(exc)}) from exc
    return jsonable({"alert": alert})


@router.delete("/{alert_id}", status_code=204)
def remove_alert(alert_id: int, db: Session = Depends(get_db)) -> Response:
    try:
        delete_alert(db, alert_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": str(exc)}) from exc
    return Response(status_code=204)


@router.post("/evaluate")
def evaluate(
    ticker: str = Query(default=settings.default_ticker),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    resolve_pending(db)
    return jsonable(evaluate_alerts(db, ticker))
