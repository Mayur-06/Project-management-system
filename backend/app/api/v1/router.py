from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.workspaces import router as workspaces_router
from app.api.v1.teams import router as teams_router
from app.api.v1.issues import router as issues_router
from app.api.v1.phase3 import router as phase3_router
from app.api.v1.phase4 import router as phase4_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router)
api_v1_router.include_router(workspaces_router)
api_v1_router.include_router(teams_router)
api_v1_router.include_router(issues_router)
api_v1_router.include_router(phase3_router)
api_v1_router.include_router(phase4_router)
