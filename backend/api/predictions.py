from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.session import get_db
from schemas.requests import PredictionCreate
from services.predictions import create_prediction, list_predictions
from utils import jsonable

router = APIRouter(prefix="/api/predictions", tags=["prediction-journal"])


@router.get("")
def get_predictions(
    ticker: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return jsonable(list_predictions(db, ticker=ticker))


@router.post("", status_code=201)
def save_prediction(payload: PredictionCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    result = create_prediction(
        db,
        payload.ticker,
        period=payload.period,
        split_ratio=payload.split_ratio,
        horizon=payload.horizon,
    )
    return jsonable(result)


@router.get("/{prediction_id}")
def get_prediction(prediction_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    payload = list_predictions(db)
    for row in payload["predictions"]:
        if row["id"] == prediction_id:
            return jsonable(row)
    raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Prediction not found."})
