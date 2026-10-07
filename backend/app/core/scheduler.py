"""
Background Cron/Scheduled Worker for Agentic AI Runtime Tasks
This file is now replaced by phase4 service worker.
"""

import asyncio
from typing import Optional
from app.core.database import get_supabase_admin
from app.services.phase4_service import Phase4Service

_worker_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None


async def agent_worker_loop(interval_seconds: int = 300):
    """
    Background worker loop that runs every interval_seconds (default 5 minutes).
    Executes background AI agent tasks.
    """
    global _stop_event

    # Initial delay before the first agent check so server starts up instantly
    try:
        if _stop_event is not None:
            await asyncio.wait_for(_stop_event.wait(), timeout=10.0)
    except asyncio.TimeoutError:
        pass

    while _stop_event is not None and not _stop_event.is_set():
        try:
            db = get_supabase_admin()
            if hasattr(Phase4Service, "execute_background_tasks"):
                await asyncio.to_thread(Phase4Service.execute_background_tasks, db)
        except Exception as e:
            print(f"[Agent Worker] Error during background task execution: {e}")

        try:
            # Wait for either interval or cancellation
            if _stop_event is not None:
                await asyncio.wait_for(_stop_event.wait(), timeout=float(interval_seconds))
            else:
                await asyncio.sleep(float(interval_seconds))
        except asyncio.TimeoutError:
            pass


def start_agent_worker(interval_seconds: int = 300):
    global _worker_task, _stop_event
    _stop_event = asyncio.Event()
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(agent_worker_loop(interval_seconds))
        print(f"[Agent Worker] Background agent worker started (interval: {interval_seconds}s)")


async def stop_agent_worker():
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
        print("[Agent Worker] Background agent worker stopped")
    _stop_event = None

