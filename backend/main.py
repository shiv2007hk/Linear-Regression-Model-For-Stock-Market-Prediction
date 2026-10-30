from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import alerts, analytics, market_data, model, predictions, watchlist
from config import get_settings
from database.session import init_db
from ml.data_loader import MarketDataError
from services.runtime_state import runtime_state
from utils import iso_utc

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("stocksense")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    logger.info("SQLite ready at %s", settings.database_url)
    yield


app = FastAPI(
    title="StockSense AI API",
    description=(
        "Educational stock analytics API. Historical prices come from Yahoo Finance through yfinance. "
        "Predictions use one-feature Simple Linear Regression and are not investment advice."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(MarketDataError)
async def market_data_error_handler(_: Request, exc: MarketDataError) -> JSONResponse:
    if exc.code == "upstream_error":
        runtime_state.record_error(exc.ticker or "unknown", exc.message)
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "validation_error", "message": str(exc)}},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    message = first.get("msg", "Invalid request.")
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "request_validation_error",
                "message": f"{field + ': ' if field else ''}{message}",
                "details": [
                    {"field": ".".join(str(p) for p in e.get("loc", [])), "message": e.get("msg")}
                    for e in exc.errors()[:5]
                ],
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "The server hit an unexpected error. Details were logged server-side; no stack trace is exposed.",
            }
        },
    )


app.include_router(market_data.router)
app.include_router(analytics.router)
app.include_router(model.router)
app.include_router(watchlist.router)
app.include_router(predictions.router)
app.include_router(alerts.router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, Any]:
    import yfinance as yf

    from services.cache import cache

    try:
        from sqlalchemy import text

        from database.session import engine

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unavailable"

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
        "yfinance_version": yf.__version__,
        "last_successful_fetch": runtime_state.last_success,
        "last_fetch_error": runtime_state.last_fetch_error,
        "cache_entries": len(getattr(cache, "_store", {})),
        "time": iso_utc(datetime.now(timezone.utc)),
        "disclaimer": "Educational analytics. Yahoo Finance data can be delayed or incomplete. Not investment advice.",
    }


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {
        "name": "StockSense AI API",
        "docs": "/docs",
        "health": "/api/health",
        "frontend": "Start the Next.js app on http://localhost:3000",
    }
