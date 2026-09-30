from fastapi import APIRouter
from app.api.v1.workspaces import router as workspaces_router
from app.api.v1.teams import router as teams_router
from app.api.v1.issues import router as issues_router

api_v1_router = APIRouter()
api_v1_router.include_router(workspaces_router)
api_v1_router.include_router(teams_router)
api_v1_router.include_router(issues_router)
