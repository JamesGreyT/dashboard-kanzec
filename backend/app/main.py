"""FastAPI entrypoint for the Kanzec Operations Dashboard.

Phase A: healthz + CORS + lifespan only.
Routers for auth, dashboard, data, ops, admin are wired in their own phases.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import healthcheck

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


@app.get("/api/healthz")
async def healthz() -> dict:
    db_ok = await healthcheck()
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
