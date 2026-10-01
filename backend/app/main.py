from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.router import api_v1_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Production-grade API for Linear-grade Project Management System",
    docs_url="/docs",
    redoc_url="/redoc",
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
