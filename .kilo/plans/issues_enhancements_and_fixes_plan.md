# Implementation Plan: Issues Enhancements, Labels & View Fixes (Final Aligned)

This technical design document outlines the exact execution plan based on the grilling session decisions.

---

## 1. Aligned Architectural Decisions

1. **Labels System**:
   - **Preset Palette**: 8 core labels will be seeded automatically per organization:
     - `Bug` (`#EF4444` - Red)
     - `Feature` (`#8B5CF6` - Purple)
     - `Improvement` (`#3B82F6` - Blue)
     - `Documentation` (`#10B981` - Emerald)
     - `Design` (`#EC4899` - Pink)
     - `Backend` (`#F59E0B` - Amber)
     - `Frontend` (`#06B6D4` - Cyan)
     - `Performance` (`#F97316` - Orange)
   - **No Custom Label Creation**: Users will select from these standard labels; no custom label creation UI.
   - **Association**: Labels can be attached and detached from issues in modals, detail pages, and the list view.
   - **Enrichment**: `IssueResponse` will include `labels: List[LabelResponse]` in `list_issues`, `create_issue`, and `update_issue`.

2. **Purge Estimate Everywhere (Frontend UI + Backend DB)**:
   - **Database**: Add migration `14_remove_estimate_column.sql`:
     ```sql
     ALTER TABLE issues DROP COLUMN IF EXISTS estimate;
     ```
   - **Backend**:
     - Remove `estimate` field from Pydantic schemas (`IssueCreate`, `IssueUpdate`, `SubtaskCreate`, `IssueResponse`, `IssueDetailResponse`, `BreakdownItem`).
     - Remove `estimate` from `issue_service.py`, `phase4_service.py`, `breakdown_agent.py`, `workspace_tools.py`, and test fixtures.
   - **Frontend**:
     - Remove `estimate` from `types/index.ts`, `CreateIssueModal.tsx`, `KanbanBoard.tsx`, `IssueListView.tsx`, `[issueIdentifier]/page.tsx`, and `IssueDetailDrawer.tsx`.

3. **Horizontal Kanban vs Vertical Kanban**:
   - **Team Issues (`issues/page.tsx`)**: Defaults to Horizontal Kanban Swimlanes (`groupBy = 'parent'`), persisted via `localStorage` across page refreshes.
   - **Vertical Issues Page (`my-issues/page.tsx`)**: Only `flat` is required. The "Parent" grouping option is completely removed from the TopNav switcher and the board is locked strictly to flat vertical Kanban (`groupBy="none"`). No localStorage grouping state or parent toggling is exposed on the vertical page.

4. **Date Created on Kanban Cards**:
   - In `KanbanBoard.tsx`, replace the footer estimate badge with a formatted creation date:
     - Format: Compact calendar format (e.g., `Oct 7` or `Oct 7, 2025` if past year) with subtle calendar icon.

5. **Popup Task Creation (No Dedicated Route)**:
   - In `layout.tsx`, change `handleOpenNewIssue` to toggle `isNewIssueOpen` state instead of navigating to `/issues/new`.
   - In `issues/page.tsx`, wire `TopNav`'s `onOpenNewIssue` and `KanbanBoard`'s `onOpenNewIssueWithState(stateId)` to open the `CreateIssueModal` directly in the page.
   - In `app/(workspace)/[orgSlug]/[teamKey]/issues/new/page.tsx`, automatically redirect to `/[orgSlug]/[teamKey]/issues?create=true`, where `issues/page.tsx` checks `searchParams.get('create')` and pops up `CreateIssueModal`.

6. **In-Line Interactive Dropdowns in Issue List View & Dropdown Clipping Fix**:
   - Columns:
     - Col 1 (2 cols): Tree Connectors + Identifier (`ENG-101`)
     - Col 2 (3 cols): Title + Subtask Progress
     - Col 3 (2 cols): Status (Interactive Dropdown)
     - Col 4 (1 col): Priority (Interactive Dropdown)
     - Col 5 (2 cols): Assignee (Interactive Dropdown)
     - Col 6 (1 col): Labels (Interactive Dropdown Tag Chip)
     - Col 7 (1 col): Date Created (`Oct 7`)
   - Interactive Handlers:
     - `e.stopPropagation()` on all dropdown triggers so clicking them does NOT open the issue details page.
     - Changing any value immediately calls `api.updateIssue(issue.id, patch)`.
     - Log activity changes in `activity_logs` so Inbox and dynamic activity feeds update in real time.
     - Dispatches `issueUpdated` event so open modals/views stay synced.
   - **Clipping Prevention (Table Boundary Fix)**:
     - Outer container provides `pb-40` padding to guarantee ample clearance below the table.
     - Table card uses `overflow-visible` (removing `overflow-hidden` which was clipping the menus).
     - Active row gets elevated `z-40` when any dropdown is open.
     - Dropdown menus dynamically flip upward (`bottom-full mb-1.5` instead of `top-full mt-1.5`) when rows are located near the bottom of the table (`idx >= Math.max(2, flattenedIssues.length - 3)`).

---

## 2. Proposed File Changes

### Database Migration
- [NEW] `supabase/migrations/14_remove_estimate_column.sql`:
  Drop `estimate` column from `issues` table safely.
  Seed standard labels for all existing organizations if not already present.

### Backend
- [MODIFY] `backend/app/schemas/issue.py`:
  Remove `estimate`. Add `label_ids: Optional[List[str]] = None` to `IssueCreate` and `IssueUpdate`. Include `labels: List[Dict[str, Any]] = []` in `IssueResponse`.
- [MODIFY] `backend/app/schemas/phase4.py`:
  Remove `estimate` from subtask/breakdown models.
- [MODIFY] `backend/app/services/issue_service.py`:
  Remove `estimate` references. Add batch label fetching for `list_issues`. Add label syncing in `create_issue` and `update_issue`. Record activity logs for label changes.
- [MODIFY] `backend/app/services/phase4_service.py`:
  Remove `estimate` in AI breakdown generation.
- [MODIFY] `backend/app/agents/breakdown_agent.py`:
  Remove `estimate` from prompt and schema.
- [MODIFY] `backend/app/agents/tools/workspace_tools.py`:
  Remove `estimate` from queries and calculations.
- [NEW] `backend/app/api/v1/labels.py`:
  `GET /api/v1/labels?organization_id=...` returning organization's standard labels (seeding if missing).
- [MODIFY] `backend/app/api/v1/router.py`:
  Include labels router.

### Frontend
- [MODIFY] `frontend/types/index.ts`:
  Remove `estimate` from `Issue`. Ensure `Label` and `Issue.labels` are typed.
- [MODIFY] `frontend/lib/api.ts`:
  Add `getLabels(orgId)` API call.
- [MODIFY] `frontend/components/issues/KanbanBoard.tsx`:
  Remove `{issue.estimate}p`. Render compact `Date Created` (`Oct 7`). Render labels chips.
- [MODIFY] `frontend/components/issues/CreateIssueModal.tsx`:
  Remove estimate field. Add Labels multi-select from standard labels.
- [MODIFY] `frontend/components/issues/IssueListView.tsx`:
  Replace Estimate column with Labels dropdown and Date Created.
  Implement interactive dropdowns for Status, Priority, Assignee, and Labels with `e.stopPropagation()`.
  Fix clipping: `overflow-visible`, `pb-40`, `z-40` active row elevation, and upward flip on bottom rows.
- [MODIFY] `frontend/app/(workspace)/[orgSlug]/[teamKey]/issues/page.tsx`:
  Add `groupBy` persistence via `localStorage`. Default to `'parent'`.
  Pass `groupBy` and `onToggleGroupBy` to `TopNav` and `KanbanBoard`.
  Handle `CreateIssueModal` popup state with `initialStateId`.
  Check query `?create=true` to auto-open popup.
- [MODIFY] `frontend/app/(workspace)/[orgSlug]/[teamKey]/my-issues/page.tsx`:
  Lock vertical Kanban strictly to `flat` (`groupBy="none"`).
  Remove `Parent` grouping option from TopNav.
  Pass `availableLabels` to `CreateIssueModal` and `IssueListView`.
- [MODIFY] `frontend/app/(workspace)/[orgSlug]/[teamKey]/layout.tsx`:
  Open `CreateIssueModal` popup instead of navigating to `/issues/new`.
- [MODIFY] `frontend/app/(workspace)/[orgSlug]/[teamKey]/issues/new/page.tsx`:
  Redirect to `/[orgSlug]/[teamKey]/issues?create=true`.
- [MODIFY] `frontend/app/(workspace)/[orgSlug]/[teamKey]/issues/[issueIdentifier]/page.tsx`:
  Remove Estimate points display and inputs. Add label tags.

---

## 3. Verification Plan

1. **Backend Tests & Schema Check**:
   - Run backend tests to verify no failures after removing estimate.
   - Verify label endpoints return standard 8 labels.
2. **Frontend Build & Linter Check**:
   - Run `npm run lint` and `npx tsc --noEmit` to ensure zero compilation or type errors.
3. **Manual Verification via Browser**:
   - **Refresh Persistence**: Toggle between Horizontal ("Parent") and Vertical ("Flat"), refresh page, verify state persists.
   - **Kanban Cards**: Verify creation date formatted as `Oct 7` is visible, estimate is gone.
   - **Popup Modal**: Click "+ New Issue" in TopNav and sidebar, press 'C', click "+" on Kanban column. Verify popup opens cleanly without route changes.
   - **Issue List Dropdowns**: Click Priority, Status, Assignee, and Labels badges. Change values and verify:
     - Row updates optimistically.
     - Does not navigate to details page.
     - Activity log is created.
     - Inbox reflects the update dynamically.
