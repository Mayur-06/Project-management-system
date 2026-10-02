"""
Background Cron/Scheduled Worker for Sprint Cycle Rollover
Strict alignment with plan2/linear_system_implementation_plan.md Section 2.G & Problem Set 7

Periodically checks for expired cycles (ends_at < NOW()) and triggers
automated rollover into the next sequential sprint cycle or backlog.
"""

import asyncio
from typing import Optional
from app.core.database import get_supabase_admin
from app.services.phase3_service import Phase3Service

_worker_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None


async def cycle_rollover_worker_loop(interval_seconds: int = 300):
    """
    Background worker loop that runs every interval_seconds (default 5 minutes).
    Checks for expired cycles and performs automatic rollover safely without blocking the event loop.
    """
    global _stop_event

    # Initial delay before the first cycle check so server starts up instantly
    try:
        if _stop_event is not None:
            await asyncio.wait_for(_stop_event.wait(), timeout=10.0)
    except asyncio.TimeoutError:
        pass

    while _stop_event is not None and not _stop_event.is_set():
        try:
            db = get_supabase_admin()
            rollovers = await asyncio.to_thread(Phase3Service.auto_rollover_expired_cycles, db)
            if rollovers:
                print(f"[Cycle Worker] Completed auto-rollover for {len(rollovers)} expired cycle(s): {rollovers}")
        except Exception as e:
            print(f"[Cycle Worker] Error during cycle rollover check: {e}")

        try:
            # Wait for either interval or cancellation
            if _stop_event is not None:
                await asyncio.wait_for(_stop_event.wait(), timeout=float(interval_seconds))
            else:
                await asyncio.sleep(float(interval_seconds))
        except asyncio.TimeoutError:
            pass


def start_cycle_rollover_worker(interval_seconds: int = 300):
    global _worker_task, _stop_event
    _stop_event = asyncio.Event()
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(cycle_rollover_worker_loop(interval_seconds))
        print(f"[Cycle Worker] Background rollover worker started (interval: {interval_seconds}s)")


async def stop_cycle_rollover_worker():
    global _worker_task, _stop_event
    if _stop_event is not None:
        _stop_event.set()
    if _worker_task is not None and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
        _worker_task = None
        print("[Cycle Worker] Background rollover worker stopped")
    _stop_event = None
