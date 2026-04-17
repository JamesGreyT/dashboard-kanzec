"""FastAPI entrypoint for the Kanzec Operations Dashboard.

Phase A: healthz + CORS + lifespan only.
Routers for auth, dashboard, data, ops, admin are wired in their own phases.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .admin_audit_router import router as audit_router
from .auth.router import router as auth_router
from .config import settings
from .dashboard.router import router as dashboard_router
from .data.router import router as data_router
from .db import healthcheck
from .ops.router import router as ops_router
from .users.router import router as users_router

log = logging.getLogger("kanzec")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log.info("starting kanzec dashboard api (origins=%s)", settings.allowed_origins_list)
    yield
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


@app.get("/api/healthz")
async def healthz() -> dict:
    db_ok = await healthcheck()
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
