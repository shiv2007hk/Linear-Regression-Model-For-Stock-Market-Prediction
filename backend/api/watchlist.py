from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from database.session import get_db
from schemas.requests import WatchlistCreate
from services.watchlist import add_watchlist, list_watchlist, remove_watchlist
from utils import jsonable

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("")
def get_watchlist(db: Session = Depends(get_db)) -> dict[str, Any]:
    return jsonable(list_watchlist(db))


@router.post("", status_code=201)
def create_watchlist_item(payload: WatchlistCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        item = add_watchlist(db, payload.ticker)
    except ValueError as exc:
        raise HTTPException(
            status_code=409, detail={"code": "watchlist_conflict", "message": str(exc)}
        ) from exc
    return jsonable({"item": item, "message": f"{item['ticker']} added to the watchlist."})


@router.delete("/{item_id}", status_code=204)
def delete_watchlist_item(item_id: int, db: Session = Depends(get_db)) -> Response:
    try:
        remove_watchlist(db, item_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": str(exc)}) from exc
    return Response(status_code=204)
