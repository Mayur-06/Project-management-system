# Plan: Replace Triage Inbox with Simple Org Inbox

## Current State
- Backend triage endpoints are not mounted; agent/router code exists but unused
- Frontend triage page does not exist
- `snoozed_until` DB column was dropped in migration 11
- Cross-team triage routing is disabled in `issue_service.py`
- `state_category` enum still includes `'triage'` value
- Stale references remain in schemas, types, `StateBadge.tsx`, `api.ts`, and plan2 docs

## Goal
Replace the removed Triage Inbox feature with a minimal org-level Inbox: a simple read-only feed of recently created issues across the organization, with no accept/snooze/decline actions, no AI classification, and no cross-team routing logic.

## Implementation Steps

### Backend
1. Add `GET /api/v1/organizations/{org_slug}/inbox` endpoint in `backend/app/api/v1/phase3.py`:
   - Query `issues` joined with `workflow_states` and `teams`
   - Filter by `organization_id`, exclude soft-deleted
   - Order by `created_at DESC`, limit 50
   - Return `IssueResponse` list
2. Add `Phase3Service.list_inbox(org_slug, user_id, db)` in `backend/app/services/phase3_service.py`:
   - Verify org access
   - Fetch recent issues across all teams in org
3. Remove stale `snoozed_until` from `backend/app/schemas/issue.py` (`IssueUpdate`, `IssueResponse`)
4. Remove unused triage agent code:
   - Delete `backend/app/agents/triage_agent.py`
   - Remove triage imports from `backend/app/api/v1/phase4.py` if present
   - Remove `autoTriage` endpoint/method if any remnants exist

### Frontend
5. Add inbox API method in `frontend/lib/api.ts`:
   - `getInbox(orgSlug): Promise<Issue[]>` calling `/organizations/{org_slug}/inbox`
6. Remove stale triage references from `frontend/lib/api.ts`:
   - Remove `TriageOutput` import and `autoTriage` method
7. Create `frontend/app/(workspace)/[orgSlug]/[teamKey]/inbox/page.tsx`:
   - Simple read-only list of recent issues across org
   - Show title, team key, state, priority, created time
   - Link to issue detail
8. Add inbox nav item to `frontend/components/sidebar/WorkspaceSidebar.tsx`:
   - Icon + label, route to `/[orgSlug]/[teamKey]/inbox`
9. Clean up types in `frontend/types/index.ts`:
   - Remove `TriageOutput` interface
   - Remove `snoozed_until` from `Issue` type
   - Remove `'triage'` from `StateCategory` type
10. Update `frontend/components/ui/StateBadge.tsx`:
    - Remove `case 'triage':` branch
11. Update `frontend/components/issues/CreateIssueModal.tsx`:
    - Remove cross-team comment if any remains
12. Update `frontend/components/issues/KanbanBoard.tsx` if triage filtering remnants exist

### Database / Migrations
13. Create migration `12_create_inbox_view.sql` (optional):
    - If needed for performance, create a view or just query directly
    - Most likely no migration needed; inbox is a simple query

### Plan Files
14. Update `plan2/linear_system_implementation_plan.md`:
    - Replace section I "Triage Inbox & Inbound Work Routing" with "Inbox"
    - Update workflow states from 6 to 5: `Backlog`, `Unstarted`, `Started`, `Completed`, `Canceled`
    - Remove triage API endpoints from endpoint catalog
    - Update team provisioning to create 5 states instead of 6
15. Update `plan2/linear_ai_agents_implementation_plan.md`:
    - Remove "Workload-Aware Triage & Classification Agent" from topology
    - Remove triage agent state machine section
    - Remove triage-related problem/solution sets

## Validation
- Run `backend/tests/test_api/test_triage_inbox_e2e.py` to confirm tests are now obsolete (expected failures until test file is updated per user request: no test changes)
- Run `backend/tests/test_api/test_phase4_endpoints.py` to confirm triage classification tests are obsolete
- Run `npm run lint` / typecheck in frontend
- Manually verify: Inbox page loads, shows recent issues, nav works

## Out of Scope (per user request)
- No test file modifications
- No removal of `'triage'` from `state_category` enum (PostgreSQL limitation noted in migration 11)
