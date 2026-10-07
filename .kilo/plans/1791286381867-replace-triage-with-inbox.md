# Plan: Replace Triage Inbox with Org-Wide Activity Notification Feed

## Current State & Background
- The legacy Triage Inbox feature (with accept/snooze/decline actions, `snoozed_until` column, and AI classification) was retired.
- A minimal interim inbox was initially placed at `/[orgSlug]/[teamKey]/inbox`, querying only the `issues` table for newly created issues.
- **Deficiencies of Interim Version**:
  1. Only showed created issues—ignoring issue updates, comments, and deletions.
  2. Soft-deleted issues were completely hidden rather than flagged as deletion events.
  3. UI styling did not match the rest of the application (missing `TopNav`, breadcrumbs, dark zinc theme tokens, `StateBadge`, and `PriorityBadge`).
  4. Backend serialization dropped `workflow_states` and `teams`, causing workflow states to render as "Unknown".
  5. Missing real-time sync via Supabase WebSockets.

---

## Architectural & UX Blueprint (Aligned via Grill-Me Session)

### 1. Data Source of Truth
- Backed by the **`activity_logs`** table in Supabase PostgreSQL, which already captures audit trail events:
  - `action`: `'issue_created'`, `'issue_updated'`, `'issue_deleted'`, `'comment_created'`
  - `changes`: JSONB containing modified fields / diffs
  - `actor_id`: User who performed the mutation
  - `issue_id`: Target issue identifier (or detached UUID for deleted issues)
  - `organization_id`: Org scoping
  - `created_at`: Event timestamp
- The backend query enriches each activity event by joining:
  - Target `issue` (identifier, title, priority, deleted_at, team_id, state_id)
  - `workflow_states` (id, name, category, color)
  - `teams` (id, key, name)
  - Actor info (name, email, avatar_url resolved from auth / workspace members)

### 2. Interaction & Deleted Issues Contract
- **Non-deleted issues**: Clicking a notification row navigates directly to `/[orgSlug]/[teamKey]/issues/[issueIdentifier]`.
- **Deleted issues**: Rendered as **non-clickable** (disabled link) with muted styling, a distinctive "Deleted" badge, and strikethrough/grayed text so users understand the deletion event without encountering a 404.
- **Actions**: No action buttons (no accept/snooze/decline); it is a pure activity & notification stream.

### 3. Real-Time Streaming
- Live-stream incoming events using **Supabase Realtime** (`supabase.channel(...)`) listening to `INSERT` on `activity_logs` for `organization_id = eq.{orgId}`.
- New events smoothly prepend to the top of the feed with a subtle highlight animation.

### 4. UI Consistency & Design System
- Incorporate the full workspace layout standard:
  - **Header**: Standard `TopNav` component with breadcrumbs (`Workspace` > `{TeamKey}` > `Inbox`), title `"Inbox"`, subtitle `"Activity Feed"`.
  - **Palette**: Dark zinc theme (`bg-black`, `bg-zinc-950`, `border-zinc-800`, `hover:bg-zinc-900/60`, `border-[#1e2025]`).
  - **Badges**: Reusable `StateBadge` and `PriorityBadge` components.
  - **Avatars**: Standard user avatar with initials fallback (`bg-indigo-600/30 border-indigo-500/40 text-indigo-300`).
  - **Typography**: Clean `font-sans` with `font-mono text-xs` for issue identifiers and timestamps.

### 5. Controls & Pagination
- **Filtering**: No filter controls—a single unified, unfiltered chronological stream of all organization activity across all teams.
- **Pagination**: Loads the most recent 50 events on mount; includes a "Load More" button at the bottom to fetch subsequent 50-event batches.

---

## Implementation Steps

### Backend
- [x] 1. **Schema Definition (`backend/app/schemas/phase3.py` & `issue.py`)**:
   - Defined `InboxItemResponse` with `id`, `action`, `changes`, `actor`, `issue_id`, `issue_identifier`, `issue_title`, `team_key`, `is_deleted`, `state`, `priority`, and `created_at`.
- [x] 2. **Phase3Service Inbox Method (`backend/app/services/phase3_service.py`)**:
   - Implemented `list_inbox(org_slug, user_id, db, limit=50, offset=0)` querying `activity_logs` with batch-fetched issue metadata, joined workflow states, teams, and resolved actor profiles.
- [x] 3. **Mount API Endpoint (`backend/app/api/v1/phase3.py`)**:
   - `GET /api/v1/organizations/{org_slug}/inbox` returning `List[InboxItemResponse]` with `limit` and `offset` query params.

### Frontend
- [x] 4. **API Client & Types (`frontend/lib/api.ts` & `frontend/types/index.ts`)**:
   - Added `InboxItem` interface to `frontend/types/index.ts`.
   - Updated `api.getInbox(orgSlug, offset, limit)` to call `/organizations/{org_slug}/inbox`.
- [x] 5. **Inbox Page Overhaul (`frontend/app/(workspace)/[orgSlug]/[teamKey]/inbox/page.tsx`)**:
   - Integrated standard `TopNav` with breadcrumbs (`Workspace` > `{TeamKey}` > `Inbox`).
   - Integrated dark zinc design system with `StateBadge`, `PriorityBadge`, actor avatars, and muted borders.
   - Handled deleted issue rows with disabled links and "Deleted" badges.
   - Added "Load More" pagination for fetching historical events.
   - Connected Supabase Realtime channel (`activity_logs`) for live updates.

---

## Validation & Quality Gates
- `npm run build`: Verify Next.js Turbopack compiles without TypeScript errors.
- Unit/E2E check: Verify `GET /api/v1/organizations/{org_slug}/inbox` returns rich notification items.
- Visual inspection: Verify font family, colors, badges, avatars, and layout align with `Issues` and `AI Copilot` pages.
