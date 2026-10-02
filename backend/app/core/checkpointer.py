"""
PostgreSQL Checkpointer Pool for LangGraph
Strict alignment with plan2/linear_ai_agents_implementation_plan.md Section 3.A & Problem Set 1

Enforces:
- Direct PostgreSQL session connection (Port 5432)
- Session connection pool using psycopg_pool and PostgresSaver
- Graceful fallback to InMemorySaver if direct database connection is not configured
"""

import os
from typing import Optional
from psycopg_pool import ConnectionPool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from app.core.config import settings

_checkpoint_pool: Optional[ConnectionPool] = None
_checkpointer_instance: Optional[BaseCheckpointSaver] = None


def get_checkpointer() -> BaseCheckpointSaver:
    """
    Returns the persistent PostgresSaver if database credentials are provided,
    otherwise falls back smoothly to InMemorySaver.
    """
    global _checkpoint_pool, _checkpointer_instance

    if _checkpointer_instance is not None:
        return _checkpointer_instance

    # Attempt to build direct PostgreSQL connection
    db_password = settings.DB_PASSWORD or os.getenv("DB_PASSWORD")
    db_host = settings.DB_HOST or os.getenv("DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com")
    db_port = settings.DB_PORT or int(os.getenv("DB_PORT", "5432"))
    db_user = settings.DB_USER or os.getenv("DB_USER", "postgres.zteuxlfrleyctdkyuzvb")
    db_name = settings.DB_NAME or os.getenv("DB_NAME", "postgres")

    if db_password:
        try:
            from langgraph.checkpoint.postgres import PostgresSaver

            conn_str = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
            _checkpoint_pool = ConnectionPool(
                conn_str,
                min_size=1,
                max_size=5,
                open=True,
                kwargs={"autocommit": True, "connect_timeout": 10},
            )
            # Create pooled PostgresSaver
            _checkpointer_instance = PostgresSaver(conn=_checkpoint_pool)
            return _checkpointer_instance
        except Exception as e:
            print(f"[Checkpointer] Warning: Failed to initialize PostgresSaver ({e}), falling back to InMemorySaver")

    _checkpointer_instance = InMemorySaver()
    return _checkpointer_instance


def close_checkpointer_pool():
    global _checkpoint_pool, _checkpointer_instance
    if settings.ENVIRONMENT == "test":
        # In pytest test runs, client context manager enters/exits each test;
        # do not close the singleton connection pool between tests
        return
    if _checkpoint_pool is not None:
        try:
            _checkpoint_pool.close()
        except Exception:
            pass
        _checkpoint_pool = None
    _checkpointer_instance = None
