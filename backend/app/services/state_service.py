from typing import List
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.state import (
    WorkflowStateResponse,
    WorkflowStateReorderRequest,
)


class StateService:
    @staticmethod
    def _verify_team_access(team_id: str, user_id: str, db: Client) -> dict:
        team_res = db.table("teams").select("id, organization_id").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found",
            )
        team = team_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", team["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to team workflow states",
            )
        return team

    @classmethod
    def list_workflow_states(cls, team_id: str, user_id: str, db: Client) -> List[WorkflowStateResponse]:
        cls._verify_team_access(team_id, user_id, db)
        states_res = (
            db.table("workflow_states")
            .select("*")
            .eq("team_id", team_id)
            .order("position")
            .execute()
        )
        return [WorkflowStateResponse(**s) for s in (states_res.data or [])]

    @classmethod
    def reorder_workflow_states(
        cls,
        team_id: str,
        reorder_data: WorkflowStateReorderRequest,
        user_id: str,
        db: Client
    ) -> List[WorkflowStateResponse]:
        cls._verify_team_access(team_id, user_id, db)

        # Batch update positions
        for item in reorder_data.states:
            db.table("workflow_states").update(
                {"position": item.position}
            ).eq("id", item.state_id).eq("team_id", team_id).execute()

        # Return updated ordered states
        states_res = (
            db.table("workflow_states")
            .select("*")
            .eq("team_id", team_id)
            .order("position")
            .execute()
        )
        return [WorkflowStateResponse(**s) for s in (states_res.data or [])]
