"""FastAPI entrypoint for the Kanzec Operations Dashboard."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .admin_audit_router import router as audit_router
from .auth.router import router as auth_router
from .config import settings
from .dashboard.router import router as dashboard_router
from .data.router import router as data_router
from .db import SessionLocal, healthcheck
from .debt.router import router as debt_router
from .ops.router import router as ops_router
from .payments.router import router as payments_router
from .rooms import service as rooms_service
from .rooms.router import router as rooms_router
from .sales.router import router as sales_router
from .snapshots.router import router as snapshots_router
from .users.router import router as users_router

log = logging.getLogger("kanzec")

_ROOMS_REFRESH_INTERVAL_SEC = 600  # 10 minutes


async def _rooms_refresh_loop() -> None:
    # Background task — keep app.room in sync with smartup_rep.deal_order.
    # Errors are logged + swallowed so a transient DB hiccup doesn't take the
    # whole app down.
    while True:
        try:
            async with SessionLocal() as session:
                count = await rooms_service.refresh_rooms(session)
                log.info("rooms refresh: %d rooms in app.room", count)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("rooms refresh failed: %s", e)
        await asyncio.sleep(_ROOMS_REFRESH_INTERVAL_SEC)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log.info("starting kanzec dashboard api (origins=%s)", settings.allowed_origins_list)

    # Synchronous bootstrap so the first request sees a hot rooms table.
    try:
        async with SessionLocal() as session:
            count = await rooms_service.refresh_rooms(session)
            log.info("rooms bootstrap: %d rooms in app.room", count)
    except Exception as e:  # noqa: BLE001
        log.warning("rooms bootstrap failed: %s", e)

    task = asyncio.create_task(_rooms_refresh_loop(), name="rooms-refresh")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        log.info("stopping kanzec dashboard api")


app = FastAPI(
    title="Kanzec Operations Dashboard",
    version="0.1.0",
    docs_url=None,        # no swagger in prod; we're internal
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(data_router)
app.include_router(ops_router)
app.include_router(users_router)
app.include_router(audit_router)
app.include_router(rooms_router)
app.include_router(debt_router)
app.include_router(snapshots_router)
app.include_router(sales_router)
app.include_router(payments_router)


@app.get("/api/healthz")
async def healthz() -> dict:
    db_ok = await healthcheck()
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
