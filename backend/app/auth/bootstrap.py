"""Run-once bootstrap: creates the admin user from env on first deploy.

Invoked from deploy.sh:
    python -m app.auth.bootstrap
"""
from __future__ import annotations

import asyncio
import logging
import sys

from ..db import SessionLocal
from . import service

log = logging.getLogger("kanzec.bootstrap")


async def _run() -> None:
    async with SessionLocal() as session:
        await service.bootstrap_admin(session)
        await session.commit()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        asyncio.run(_run())
    except Exception as e:  # noqa: BLE001
        log.error("bootstrap failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
