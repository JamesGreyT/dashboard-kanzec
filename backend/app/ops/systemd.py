"""systemctl shell-outs. Read-only introspection — `is-active` is a
state query that any local user can run without sudo."""
from __future__ import annotations

import asyncio
import logging
import shlex

log = logging.getLogger(__name__)

_UNIT_PREFIX = "smartup-kanzec-etl-report@"


async def is_active(report_key: str) -> str:
    """Returns one of: 'active', 'inactive', 'failed', 'activating', 'unknown'."""
    unit = f"{_UNIT_PREFIX}{report_key}.service"
    try:
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "is-active", unit,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        return stdout.decode().strip() or "unknown"
    except (asyncio.TimeoutError, FileNotFoundError) as e:
        log.warning("systemctl is-active %s timed out / not found: %s", unit, e)
        return "unknown"


async def stream_journal(report_key: str, lines: int = 500):
    """Async iterator yielding lines from journalctl -u ... -f.

    The smartup-etl user can read their own unit's journal without sudo. If
    this turns out not to work, we can add a polkit rule later.
    """
    unit = f"{_UNIT_PREFIX}{report_key}.service"
    cmd = ["journalctl", "-u", unit, "-f", "-n", str(int(lines)), "-o", "short-iso"]
    log.info("journal stream: %s", shlex.join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert proc.stdout is not None

    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            yield line.decode(errors="replace").rstrip("\n")
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2)
            except asyncio.TimeoutError:
                proc.kill()
