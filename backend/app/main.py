import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.router import api_v1_router
from app.core.checkpointer import get_checkpointer, close_checkpointer_pool
from app.core.scheduler import start_agent_worker, stop_agent_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize checkpointer connection pool and background agent worker
    try:
        await asyncio.to_thread(get_checkpointer)
    except Exception as e:
        print(f"[Startup] Checkpointer init notice: {e}")

    try:
        start_agent_worker(interval_seconds=300)
    except Exception as e:
        print(f"[Startup] Agent worker init notice: {e}")

    yield

    # Shutdown: Cleanly terminate worker tasks and close connection pools
    try:
        await stop_agent_worker()
    except Exception:
        pass
    try:
        close_checkpointer_pool()
    except Exception:
        pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Production-grade API for Linear-grade Project Management System",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
    }
