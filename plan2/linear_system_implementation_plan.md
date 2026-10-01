# System Implementation Details: Linear-Grade Project Management System

## 1. Architectural Overview & Core Principles

### Architectural Vision
This technical specification defines the engineering implementation for a high-performance, keyboard-first Project Management and Issue Tracking System modeled after Linear. The system is designed to provide sub-50ms operational response times, real-time multi-client collaboration, optimistic local updates, and enterprise-grade multi-tenancy.

### System Topology
The system architecture is organized into four distinct operational tiers:

* **Presentation Layer (Frontend):** Built with Next.js 15 (App Router) and TypeScript. It utilizes server-side rendering for application shells and rapid client-side rendering with Zustand and TanStack Query v5 for zero-latency UI interactions. The visual system is constructed using Tailwind CSS and accessible primitives, supplemented by a universal Command Palette and rich text editing capabilities.
* **API Gateway & Business Logic (Backend):** Built with asynchronous FastAPI (Python 3.12) and Pydantic v2. This service acts as the single authoritative mutation gate, managing authentication verification, input validation, transaction boundaries, optimistic locking, and activity auditing.
* **Data & Realtime Layer (Supabase Platform):** Powered by PostgreSQL 16. It handles relational storage, multi-tenant Row-Level Security (RLS), real-time broadcast synchronization via WebSocket channels, Change Data Capture (CDC), file object storage, and vector similarity search via the pgvector extension.
* **Agentic Intelligence Runtime (AI Engine):** Powered by LangGraph and LangChain. It executes asynchronous, stateful, and Human-in-the-Loop workflows for issue triage, technical specification breakdown, duplicate detection, and conversational workspace querying.

### The Authoritative Write-Path Invariant
A foundational architectural rule governs all mutations across the system:

1. **Single Authoritative Write Path:** The Next.js frontend is strictly prohibited from mutating database tables directly via Supabase PostgREST endpoints. All state mutations (creations, updates, state transitions, deletions, reordering) must flow exclusively through the FastAPI backend gateway. This ensures that business logic validation, schema sanitization, and activity audit logging execute deterministically.
2. **Restricted Client-Side Supabase Usage:** The Supabase client within the frontend is restricted exclusively to two functions:
   * **Authentication Session Management:** Handling user login, token refresh cycles, and OAuth redirects.
   * **Realtime Channel Subscriptions:** Subscribing to collaborative broadcast channels and database change feeds to receive live updates from other team members.
3. **Streaming Protocol:** All AI interaction streams utilize Server-Sent Events (SSE) transmitted over authenticated HTTP POST requests, enabling bidirectional token streaming and client-driven cancellation via standard abort controllers.

---

## 2. Comprehensive System Features

### A. Workspace, Tenant & Access Management
* **Multi-Tenant Organization Isolation:** Complete separation of company data through dedicated organization entities and tenant identifiers on all downstream records.
* **Role-Based Access Control (RBAC):** Three-tier hierarchical roles within organizations:
  * *Admin:* Full administrative control over organization settings, billing, team creation, workflow customization, and member invitation/removal.
  * *Member:* Standard access to create, update, and manage issues, projects, cycles, and comments across joined teams.
  * *Guest:* Restricted read-only or single-team access for external contractors and stakeholders.
* **Cross-Team Memberships:** Users can belong to multiple functional teams within an organization, each with independent visibility and notification settings.

### B. Team Configuration & Fixed Workflows
* **Team Identification:** Teams possess unique human-readable keys (such as ENG, DES, PROD) that prefix all issue identifiers.
* **Standardized 6-State Workflow:** All teams operate on 6 fixed, system-enforced workflow states (`Triage`, `Backlog`, `Unstarted`, `Started`, `Completed`, `Canceled`). Custom statuses and custom column ordering are strictly disallowed to guarantee platform-wide consistency and predictable metrics.
* **Standardized State Visuals:** Each of the 6 fixed states has a system-defined color and fixed column order across Kanban and List views.
* **Configurable Sprint Cadence:** Teams configure custom cycle lengths (e.g., 1-week, 2-week, or custom durations) and automated cycle rollover rules.

### C. Core Issue & Dependency Engine
* **Readable Sequential Identifiers:** Automatic sequential numbering per team producing clean identifiers (e.g., ENG-101, ENG-102) managed through transactional database counters.
* **Rich Markdown Editing:** TipTap-powered editor supporting rich formatting, code blocks, task lists, and slash commands.
* **Hierarchical Subtasks:** Arbitrary nesting of parent issues and child subtasks with aggregated progress tracking.
* **Granular Issue Attributes:** Native support for priority tiers (Urgent, High, Medium, Low, None), Fibonacci story point estimates, due dates, assignees, project associations, cycle allocations, and customizable color-coded labels.

### D. High-Speed Keyboard-First User Experience
* **Universal Command Palette (Cmd+K / Ctrl+K):** Instant global search and action launcher capable of finding issues, navigating views, switching teams, and executing system commands without touching the mouse.
* **Single-Key Shortcuts:** Industry-standard keyboard shortcuts for rapid issue triage:
  * Status assignment shortcuts.
  * Priority switching keys.
  * Assignee quick-selection dialogs.
  * Label filtering and attachment toggles.
* **Virtualized Data Rendering:** Smooth scrolling across thousands of issues utilizing DOM virtualization for both list tables and Kanban board columns.

### E. Collaborative Real-Time Workspace
* **Interactive Kanban Board View:** Drag-and-drop issue movement across workflow columns powered by accessible drag engines.
* **Synchronized List View:** High-density, configurable data grid supporting multi-column sorting, grouping by priority/assignee/project, and custom filtering.
* **Sub-50ms Realtime Broadcasting:** Instant state propagation to all active workspace viewers via WebSocket broadcast channels.
* **Optimistic Local Mutations:** Zero-latency UI response where card positions and field edits reflect immediately on the user's screen before the backend response resolves.
* **Presence Indicators:** Live indicators showing which team members are currently viewing or modifying specific issues.

### F. Sprint & Cycle Automation
* **Automated Cycle Progression:** Automatic transition of sprints based on configured start and end timestamps.
* **Cycle Velocity Metrics:** Real-time calculation of completed versus planned story points, total issues closed, and scope changes mid-sprint.
* **Burnup & Burndown Analytics:** Interactive charts showing progress trends throughout the active cycle lifecycle.
* **Unfinished Work Rollover Engine:** One-click or automated migration of incomplete issues from a closed cycle to either the team backlog or the immediate next cycle.

### G. Milestones & Health Statuses
* **Milestone Sequences:** Granular checkpoints within projects tracking major architectural or business phases.
* **Project Health Statuses:** Explicit health tracking categorizing projects directly as On Track, At Risk, or Off Track.

### H. Triage Inbox & Inbound Work Routing
* **Dedicated Triage Queue:** Holding area for untriaged issues originating from external integrations, customer requests, or cross-departmental tickets.
* **Three-Way Disposition Actions:**
  * *Accept:* Move issue into an active workflow state, assign a team member, and allocate to a sprint or backlog.
  * *Snooze:* Hide the issue from the active inbox until a specified future date and time.
  * *Decline:* Archive or cancel the issue with an explicit cancellation rationale.

### I. Social, Audit & Media Ecosystem
* **Rich Discussion Threads:** Comment sections supporting TipTap JSON formatting, user mentions, code snippets, and timestamped revisions.
* **Emoji Reaction System:** Interactive sentiment reactions on comments with multi-user clustering.
* **Comprehensive Activity Audit Logging:** Immutable audit records capturing every property mutation, state change, and assignee transfer with actor attribution and timestamping.
* **Direct File Attachments:** Pre-signed direct-to-storage upload mechanism supporting images, videos, logs, and diagnostic archives.

---

## 3. Database Architecture & Data Model Specifications

### Data Entities & Schema Definitions

#### 1. Organizations (`organizations`)
* **Purpose:** Multi-tenant boundary entity representing the company or organization.
* **Attributes:**
  * `id`: UUID (Primary Key, system-generated).
  * `name`: String (255 chars, required) - Organization name.
  * `slug`: String (100 chars, unique, required) - URL-safe unique slug.
  * `logo_url`: String (optional) - Public asset URL for workspace branding.
  * `created_at`: Timestamp with time zone (defaults to current time).
  * `updated_at`: Timestamp with time zone (defaults to current time).

#### 2. Workspace Members (`workspace_members`)
* **Purpose:** Links registered authentication users to specific organizations with assigned administrative privileges.
* **Attributes:**
  * `id`: UUID (Primary Key).
  * `organization_id`: UUID (Foreign Key references `organizations.id`, cascading delete).
  * `user_id`: UUID (Foreign Key references Supabase authentication users, cascading delete).
  * `role`: Enumeration (`admin`, `member`, `guest`). Defaults to `member`.
  * `created_at`: Timestamp with time zone.
* **Constraints:** Unique composite constraint on (`organization_id`, `user_id`).

#### 3. Teams (`teams`)
* **Purpose:** Functional groups within an organization that own issues and workflows.
* **Attributes:**
  * `id`: UUID (Primary Key).
  * `organization_id`: UUID (Foreign Key references `organizations.id`, cascading delete).
  * `name`: String (255 chars, required) - Team name.
  * `key`: String (10 chars, required) - Prefix key for issues (e.g., ENG).
  * `issue_counter`: Integer (defaults to 0, required) - Monotonically increasing counter for sequential issue numbering.
  * `cycle_duration_weeks`: Integer (defaults to 2) - Sprint duration setting.
  * `created_at`: Timestamp with time zone.
* **Constraints:** Unique composite constraint on (`organization_id`, `key`).

#### 4. Team Memberships (`team_members`)
* **Purpose:** Maps organization members into specific functional teams.
* **Attributes:**
  * `id`: UUID (Primary Key).
  * `team_id`: UUID (Foreign Key references `teams.id`, cascading delete).
  * `user_id`: UUID (Foreign Key references Supabase authentication users, cascading delete).
  * `created_at`: Timestamp with time zone.
* **Constraints:** Unique composite constraint on (`team_id`, `user_id`).

#### 5. Workflow States (`workflow_states`)
* **Purpose:** Defines the 6 standardized workflow progress stages an issue traverses within a team.
* **Attributes:**
  * `id`: UUID (Primary Key).
  * `team_id`: UUID (Foreign Key references `teams.id`, cascading delete).
  * `name`: String (100 chars, required) - Standard state name (`Triage`, `Backlog`, `Unstarted`, `Started`, `Completed`, `Canceled`).
  * `color`: String (20 chars, required) - Standardized color code.
  * `category`: Enumeration (`triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`).
  * `position`: String (Collate "C", required) - System-fixed fractional index (e.g. `0|h00000:`, `0|h10000:` etc.) ensuring immutable display order.
  * `is_default`: Boolean (defaults to true for `Unstarted`).
  * `created_at`: Timestamp with time zone.
* **Note:** Teams are provisioned with these 6 immutable states upon creation. Custom statuses or column reordering are strictly prohibited.

#### 6. Cycles (`cycles`)
* **Purpose:** Time-boxed sprint periods for tracking team execution cadence.
* **Attributes:**
  * `id`: UUID (Primary Key).
  * `team_id`: UUID (Foreign Key references `teams.id`, cascading delete).
  * `number`: Integer (required) - Sequential cycle number within the team.
  * `name`: String (255 chars, optional) - Custom cycle title.
  * `starts_at`: Timestamp with time zone (required).
  * `ends_at`: Timestamp with time zone (required).
  * `completed_at`: Timestamp with time zone (optional) - Recorded upon manual or automatic closure.
  * `created_at`: Timestamp with time zone.
* **Constraints:** Unique composite constraint on (`team_id`, `number`).

#### 7. Projects & Milestones (`projects`, `project_milestones`)
* **Projects Attributes:**
  * `id`: UUID (Primary Key).
  * `organization_id`: UUID (Foreign Key references `organizations.id`, cascading delete).
  * `name`: String (255 chars, required).
  * `slug`: String (255 chars, required).
  * `health`: Enumeration (`on_track`, `at_risk`, `off_track`). Defaults to `on_track`.
  * `sort_order`: String (Collate "C", required) - Fractional index.
  * `created_at`: Timestamp with time zone.
  * *Constraints:* Unique composite constraint on (`organization_id`, `slug`).
* **Project Milestones Attributes:**
  * `id`: UUID (Primary Key).
  * `project_id`: UUID (Foreign Key references `projects.id`, cascading delete).
  * `name`: String (255 chars, required).
  * `target_date`: Date (optional).
  * `completed_at`: Timestamp with time zone (optional).
  * `sort_order`: String (Collate "C", required).
  * `created_at`: Timestamp with time zone.

#### 8. Labels (`labels`)
* **Purpose:** Organization-wide taxonomy tags for categorizing work.
* **Attributes:**
  * `id`: UUID (Primary Key).
  * `organization_id`: UUID (Foreign Key references `organizations.id`, cascading delete).
  * `name`: String (50 chars, required).
  * `color`: String (20 chars, required).
  * `description`: String (Text, optional).
  * `created_at`: Timestamp with time zone.
* **Constraints:** Unique composite constraint on (`organization_id`, `name`).

#### 9. Issues (`issues`) - Core Entity
* **Purpose:** The fundamental unit of work across the platform.
* **Attributes:**
  * `id`: UUID (Primary Key).
  * `organization_id`: UUID (Foreign Key references `organizations.id`, cascading delete).
  * `team_id`: UUID (Foreign Key references `teams.id`, restrict delete).
  * `number`: Integer (required) - Sequential number within team.
  * `identifier`: String (30 chars) - Formatted identifier (e.g., ENG-104).
  * `title`: String (500 chars, required) - Issue summary.
  * `description_json`: JSONB (optional) - TipTap rich document structure.
  * `description_text`: String (Text, optional) - Plain text version for indexing and search.
  * `priority`: Enumeration (`none`, `low`, `medium`, `high`, `urgent`). Defaults to `none`.
  * `estimate`: Integer (optional) - Story point sizing.
  * `state_id`: UUID (Foreign Key references `workflow_states.id`).
  * `assignee_id`: UUID (Foreign Key references authentication users, null on delete).
  * `creator_id`: UUID (Foreign Key references authentication users).
  * `project_id`: UUID (Foreign Key references `projects.id`, null on delete).
  * `cycle_id`: UUID (Foreign Key references `cycles.id`, null on delete).
  * `parent_id`: UUID (Foreign Key references `issues.id`, null on delete) - Subtask parent link.
  * `sort_order`: String (Collate "C", required) - Lexicographical fractional position within current state column.
  * `version`: Integer (defaults to 1, required) - Monotonically increasing revision counter for optimistic locking.
  * `last_modified_by_session`: String (100 chars, optional) - Frontend client session ID for echo suppression.
  * `due_date`: Date (optional).
  * `snoozed_until`: Timestamp with time zone (optional) - Triage snooze timestamp.
  * `completed_at`: Timestamp with time zone (optional).
  * `canceled_at`: Timestamp with time zone (optional).
  * `created_at`: Timestamp with time zone.
  * `updated_at`: Timestamp with time zone.
  * `deleted_at`: Timestamp with time zone (optional) - Soft-deletion marker.
* **Constraints:** Unique composite constraint on (`team_id`, `number`).

#### 10. Supporting Issue Entities
* **Issue Labels (`issue_labels`):** Join table between `issues` and `labels` with composite primary key (`issue_id`, `label_id`).
* **Issue Comments (`issue_comments`):** Threaded comments on issues with rich JSON and plain text fields, user attribution, soft-delete timestamp, and update tracking.
* **Comment Reactions (`comment_reactions`):** Mapping of user emoji reactions to specific comments. Constrained to one reaction per emoji per user per comment.
* **Issue Attachments (`issue_attachments`):** Metadata for uploaded files including storage path, file name, file size, MIME type, and uploader attribution.
* **Activity Audit Logs (`activity_logs`):** Append-only audit log recording actor ID, target issue ID, action string, and JSON changeset showing previous and updated values.
* **Issue Vector Embeddings (`issue_embeddings`):** Holds high-dimensional 768-dimension vectors generated from issue titles and descriptions, linked to organization ID for multi-tenant semantic search.

### Database Indexing & Query Acceleration
* **Board Sorting Index:** Composite B-tree index on `issues (team_id, state_id, sort_order)` filtered where `deleted_at IS NULL`. Directly accelerates Kanban board column rendering and avoids full table scans.
* **Entity Relationship Indexes:** Dedicated indexes on `organization_id`, `assignee_id`, `cycle_id`, `project_id`, `parent_id`, and `identifier`.
* **Vector Similarity Index:** Hierarchical Navigable Small World (HNSW) index on `issue_embeddings` using cosine vector operations with parameters `m = 16` and `ef_construction = 64`.

### Multi-Tenant Row-Level Security (RLS) Strategy
* All tables enforce PostgreSQL Row-Level Security.
* Access is validated against the authenticated user's organization memberships. A security definer function retrieves all authorized organization IDs for the current user.
* For write operations via the client, RLS policies are set to reject direct mutations, guaranteeing that writes cannot bypass the FastAPI gateway.
* Vector embedding searches use security definer functions that explicitly scope comparisons to the requesting user's organization.

---

## 4. API Gateway & Endpoint Implementation Specifications

### Authentication & Tenant Resolution
* All endpoints reside under the `/api/v1` namespace.
* Every request requires an `Authorization: Bearer <JWT>` header containing a valid Supabase Auth token.
* A custom FastAPI authentication dependency decodes and cryptographically validates the JWT against the Supabase signing secret.
* The dependency extracts the user ID, queries or reads the user's tenant memberships from token claims, and verifies access rights before routing to the endpoint handler.

### Comprehensive Endpoint Catalog

| Endpoint URI | Method | Input Parameters / Body | Behavior & Business Rules | Expected Response |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/workspaces/me` | GET | None | Retrieves user profile, organizations list, and active team memberships. | Organization and team metadata array. |
| `/api/v1/workspaces` | POST | Organization name, slug, logo URL | Validates unique slug; creates organization; assigns caller as initial admin. | Created organization record (201 Created). |
| `/api/v1/workspaces/{org_slug}/teams` | GET | URL path: `org_slug` | Lists all teams within the specified organization accessible to user. | Array of team objects. |
| `/api/v1/workspaces/{org_slug}/teams` | POST | URL path: `org_slug`, Body: Team name, key (e.g. ENG), cycle duration | Validates key uniqueness in org; initializes the 6 fixed workflow states and issue counter. | Created team record (201 Created). |
| `/api/v1/teams/{team_id}/members` | GET | URL path: `team_id` | Lists all users assigned to the specified team. | Array of user profile objects with team roles. |
| `/api/v1/teams/{team_id}/states` | GET | URL path: `team_id` | Returns the team's 6 fixed workflow states in standard display order. | Array of workflow states. |
| `/api/v1/issues` | GET | Query params: `team_id`, `state_id`, `assignee_id`, `cycle_id`, `project_id`, `priority`, `search` | Applies multi-parameter filtering, excludes soft-deleted items, orders by sort order. | Paginated issue list. |
| `/api/v1/issues` | POST | Title, description JSON, team ID, state ID, priority, estimate, assignee, project, cycle | Atomically increments team issue counter; generates identifier (e.g. ENG-104); calculates initial sort order; logs creation activity. | Created issue entity (201 Created). |
| `/api/v1/issues/{issue_id}` | GET | URL path: `issue_id` (UUID or Key like ENG-104) | Resolves issue by UUID or identifier; retrieves full details, labels, attachments, and subtasks. | Detailed issue payload. |
| `/api/v1/issues/{issue_id}` | PATCH | URL path: `issue_id`, Body: Partial issue fields, `expected_version`, `client_session_id` | Checks `expected_version` against DB version; rejects with 409 Conflict if mismatched; increments version; writes audit log; broadcasts change. | Updated issue entity. |
| `/api/v1/issues/{issue_id}` | DELETE | URL path: `issue_id` | Marks `deleted_at = NOW()`; cascades soft-delete to subtasks; broadcasts deletion. | Status confirmation (204 No Content). |
| `/api/v1/issues/{issue_id}/reorder` | PUT | URL path: `issue_id`, Body: Target state ID, previous issue position, next issue position | Generates midpoint fractional index between adjacent items; updates state and sort order; broadcasts to board. | Updated issue with new position. |
| `/api/v1/issues/batch-reorder` | POST | Array of issue IDs with target state IDs and calculated positions | Executes atomic database transaction updating all positions in a single batch. | Success confirmation with modified count. |
| `/api/v1/issues/batch-update` | POST | Array of issue IDs, target modifications (state, assignee, cycle, priority) | Applies bulk updates within a single transaction; triggers audit logging for each item. | Array of updated issue IDs. |
| `/api/v1/issues/{issue_id}/subtasks` | GET | URL path: `issue_id` | Lists all child issues linked via `parent_id`. | Array of sub-issue records. |
| `/api/v1/issues/{issue_id}/subtasks` | POST | URL path: `issue_id`, Body: Subtask title, assignee, estimate, priority | Creates issue with `parent_id` pre-populated; calculates position within parent. | Created subtask record (201 Created). |
| `/api/v1/issues/{issue_id}/activity` | GET | URL path: `issue_id` | Retrieves chronological audit trail showing changes, timestamps, and actors. | Array of activity audit logs. |
| `/api/v1/issues/{issue_id}/comments` | GET | URL path: `issue_id` | Lists comments with reactions and author profile metadata. | Array of comment objects. |
| `/api/v1/issues/{issue_id}/comments` | POST | URL path: `issue_id`, Body: Rich JSON body, plain text body | Validates comment body; stores comment; notifies mentioned users; broadcasts addition. | Created comment object (201 Created). |
| `/api/v1/comments/{comment_id}` | PATCH | URL path: `comment_id`, Body: Updated body JSON/text | Validates author ownership; updates body and sets `updated_at`. | Updated comment object. |
| `/api/v1/comments/{comment_id}` | DELETE | URL path: `comment_id` | Verifies caller is author or admin; sets soft-delete timestamp. | Confirmation (204 No Content). |
| `/api/v1/comments/{comment_id}/reactions` | POST | URL path: `comment_id`, Body: Emoji string | Toggles emoji reaction (removes if already active, creates if not). | Active reactions summary for comment. |
| `/api/v1/teams/{team_id}/cycles` | GET | URL path: `team_id` | Returns active, upcoming, and past completed sprints. | Array of cycle records with metrics. |
| `/api/v1/teams/{team_id}/cycles` | POST | URL path: `team_id`, Body: Start date, end date, optional name | Generates next sequential cycle number; creates sprint record. | Created cycle entity (201 Created). |
| `/api/v1/cycles/{cycle_id}` | GET | URL path: `cycle_id` | Calculates velocity, point completion percentages, and burnup data. | Detailed cycle metrics object. |
| `/api/v1/cycles/{cycle_id}/complete` | POST | URL path: `cycle_id`, Body: Unfinished issue destination (next cycle or backlog) | Closes cycle; marks `completed_at`; transfers incomplete issues to destination atomically. | Closed cycle summary and transfer count. |
| `/api/v1/organizations/{org_slug}/projects` | GET | URL path: `org_slug` | Lists all projects with issue completion progress, milestone counts, and health status. | Array of project summaries. |
| `/api/v1/organizations/{org_slug}/projects` | POST | Name, slug | Validates slug uniqueness; initializes project sort order and default health. | Created project entity (201 Created). |
| `/api/v1/projects/{project_id}` | GET | URL path: `project_id` | Fetches project metadata, milestones, and linked issue summaries. | Complete project overview. |
| `/api/v1/projects/{project_id}` | PATCH | URL path: `project_id`, Body: `health`, `name` | Updates project health status directly (`on_track`, `at_risk`, `off_track`) or name. | Updated project entity. |
| `/api/v1/projects/{project_id}/milestones` | POST | URL path: `project_id`, Body: Name, target date | Adds a granular milestone checkpoint to the project. | Created milestone entity (201 Created). |
| `/api/v1/milestones/{milestone_id}` | PATCH | URL path: `milestone_id`, Body: Name, target date, completed_at | Updates milestone checkpoint details or marks as completed. | Updated milestone entity. |
| `/api/v1/teams/{team_id}/triage` | GET | URL path: `team_id` | Retrieves issues currently in Triage state that have not been snoozed. | Array of triage issues. |
| `/api/v1/triage/{issue_id}/accept` | POST | URL path: `issue_id`, Body: Target state ID, assignee ID, cycle ID | Moves issue from Triage category to target state; assigns metadata; clears triage flag. | Updated issue object. |
| `/api/v1/triage/{issue_id}/snooze` | POST | URL path: `issue_id`, Body: Snooze timestamp | Sets `snoozed_until` timestamp; hides issue from default triage inbox until elapsed. | Snoozed confirmation. |
| `/api/v1/triage/{issue_id}/decline` | POST | URL path: `issue_id`, Body: Decline reason | Transitions issue to Canceled category; records reason in activity log. | Canceled issue confirmation. |
| `/api/v1/attachments/upload-url` | POST | Issue ID, file name, MIME type, file size | Validates file limits; generates pre-signed upload URL for direct storage write; creates attachment placeholder. | Signed upload URL and attachment ID. |

---

## 5. Realtime Synchronization & Concurrency Architecture

### Realtime Synchronization Engine
The platform implements a multi-client real-time synchronization strategy to provide instant collaborative updates without incurring excessive database overhead:

1. **Scoped Broadcast Channels:** Clients join team-level WebSocket broadcast channels managed by Supabase Realtime (e.g., `realtime:team:{team_id}:board`).
2. **Gateway-Dispatched Events:** Whenever FastAPI successfully completes a mutation, it publishes a structured event payload across the corresponding Realtime broadcast channel. This payload contains:
   * Event type (e.g., `issue_updated`, `issue_moved`, `comment_added`).
   * Affected entity ID and changed properties.
   * Version counter.
   * Originating client session ID.
3. **Change Data Capture (CDC) Fallback:** Supabase Postgres Change streams serve as a secondary fallback channel for background processes or administrative direct updates, ensuring system state never drifts.

### Optimistic UI State Management
To achieve Linear-grade responsiveness, the frontend executes optimistic UI updates:
* **Immediate Local Mutation:** When a user drags a card to a new column or edits a field, the client Zustand store and TanStack Query cache update instantaneously.
* **Background Mutation Dispatch:** The mutation request is sent asynchronously to the FastAPI backend along with the client's current entity version and a unique client session ID.
* **Graceful Conflict Rollback:** If the backend rejects the update (e.g., HTTP 409 Conflict due to concurrent edits or network failure), the client cache automatically rolls back to the previous snapshot and displays a non-intrusive alert.

---

## 6. Comprehensive Problem-Solution Sets

### Problem Set 1: Direct Database Bypass & Data Inconsistency
* **The Problem:** Allowing the frontend client to perform direct inserts and updates via Supabase PostgREST bypasses application-level validations. Business rules—such as sequential identifier generation (ENG-104), activity log generation, and optimistic lock checks—are easily skipped or compromised by untrusted client requests.
* **The Architectural Solution:**
  1. Strict write-path isolation: All mutation permissions (`INSERT`, `UPDATE`, `DELETE`) are completely revoked from client-facing roles on core tables via PostgreSQL Row-Level Security policies.
  2. The FastAPI backend connects using a privileged service connection and serves as the sole gateway for mutations.
  3. Every mutation endpoint in FastAPI wraps the operation in a transaction that executes: input schema validation, optimistic lock verification, database write, activity audit log insertion, and broadcast event emission.

---

### Problem Set 2: Realtime Echo & Screen Flickering (Self-Echo)
* **The Problem:** In a real-time collaborative board, when a user moves an issue card, the client applies an optimistic update locally. Shortly after, the backend processes the mutation and broadcasts the change over the WebSocket channel. When the originating client receives its own broadcasted event, it re-renders the card, often causing noticeable visual jumping, input focus loss, or duplicate animations.
* **The Architectural Solution:**
  1. The client generates a unique ephemeral Session ID when opening the application.
  2. Every mutation payload sent from the frontend includes this `client_session_id` in its request body.
  3. FastAPI stores this session ID in the database record's `last_modified_by_session` column and includes it in the broadcast event payload.
  4. When receiving Realtime broadcast messages, client event listeners check if the event's `client_session_id` matches the local session. If it matches, the client suppresses the update, avoiding redundant re-renders. If it differs, the client smoothly incorporates the change from the remote collaborator.

---

### Problem Set 3: Race Conditions in Column Reordering & Kanban Drag-and-Drop
* **The Problem:** In traditional systems using integer ordering (e.g., positions 1, 2, 3), inserting a card between items requires incrementing the position of all subsequent cards. When two users simultaneously drag cards into the same column, concurrent integer-shift updates collide, resulting in duplicate positions, failed constraints, or corrupted visual order.
* **The Architectural Solution:**
  1. The system adopts lexicographical fractional indexing (LexoRank). Issue positions are stored as variable-length ASCII strings with "C" collation.
  2. When an issue is moved between two existing items with positions "A" and "B", the algorithm calculates a mathematical midpoint string (e.g., "AN") without altering the positions of any other cards in the column.
  3. Reorder mutations operate in constant O(1) time complexity and modify only the single moved record.
  4. If positions ever become too dense (e.g., strings exceeding maximum length thresholds), an asynchronous maintenance function redistributes the fractional keys across the column cleanly during off-peak hours.

---

### Problem Set 4: Lost Updates & Concurrent Edit Overwrites
* **The Problem:** Two team members open the same issue simultaneously. User A edits the description, while User B adjusts the priority. If User B saves after User A without concurrency checks, User B's payload might overwrite User A's updated description, causing silent data loss.
* **The Architectural Solution:**
  1. Optimistic Concurrency Control (OCC) is enforced using a dedicated `version` integer column on the `issues` table.
  2. When the client fetches an issue, it retains the current version number.
  3. On every update request, the client must submit an `expected_version` property matching the version it originally read.
  4. The FastAPI backend executes an atomic conditional update verifying that the database version matches `expected_version`. If matched, the update succeeds and increments `version` by 1.
  5. If the version in the database has already progressed, the backend immediately aborts the transaction and returns an HTTP 409 Conflict status accompanied by the latest server state.
  6. The frontend detects the 409 error, prompts the user with a visual side-by-side diff of conflicting changes, and enables non-destructive field reconciliation.

---

### Problem Set 5: Multi-Tenant Data Leakage & Starvation in Vector Searches
* **The Problem:** When using high-dimensional vector search (pgvector) in a multi-tenant database, applying an organization filter (`WHERE organization_id = ?`) on top of an approximate nearest neighbor (HNSW) index can cause result starvation. The HNSW algorithm explores nearest neighbors globally; if the closest global vectors belong to other organizations, the search hits its search limit (`ef_search`) before finding enough matching records for the target tenant, returning incomplete or empty results.
* **The Architectural Solution:**
  1. All vector queries are executed through an isolated PostgreSQL stored function configured with security definer permissions.
  2. Inside the function, the session configuration parameter `hnsw.iterative_scan` is explicitly set to `relaxed_order`. This instructs PostgreSQL to continue scanning the index iteratively until the requested number of tenant-filtered matches is fulfilled.
  3. Strict Row-Level Security policies are applied to the vector table, ensuring that even if an index scan leaks internal candidates, unauthorized records are blocked from returning to the application layer.

---

### Problem Set 6: Soft-Delete Cascading Across Hierarchical Subtasks
* **The Problem:** When an issue is soft-deleted (`deleted_at = NOW()`), standard database foreign key cascading rules (`ON DELETE CASCADE`) do not trigger because no rows are actually removed. Consequently, child subtasks remain active in the system, causing orphaned tasks and broken parent references.
* **The Architectural Solution:**
  1. An atomic PostgreSQL trigger is bound to the `issues` table listening for updates to `deleted_at`.
  2. When an issue's `deleted_at` transitions from null to a timestamp, the trigger automatically propagates the timestamp to all descendant subtasks where `parent_id = deleted_issue_id`.
  3. If an issue is restored (`deleted_at` set back to null), a reciprocal trigger reactivates immediate child tasks.

---

### Problem Set 7: Race Conditions During Sprint Cycle Closure & Rollover
* **The Problem:** When closing a sprint cycle, dozens of incomplete issues must be transitioned to the next cycle or returned to the backlog while cycle velocity statistics are calculated. If team members are actively updating issue statuses during the closure operation, items can be omitted from rollover, velocity counts can become inaccurate, and issues can end up in inconsistent states.
* **The Architectural Solution:**
  1. Cycle completion is implemented as an atomic PostgreSQL stored procedure.
  2. The procedure locks the cycle record exclusively to block concurrent closure attempts.
  3. It calculates final sprint metrics (completed story points, total completed issues, incomplete points) from an isolated snapshot and writes them into the completed cycle record.
  4. In the same atomic transaction, it executes a batch update moving all unresolved issues (states not in category `completed` or `canceled`) into the designated destination cycle or backlog.
  5. An audit log entry is batch-created for each transferred issue, and a single consolidated Realtime broadcast notifies all connected clients to reload cycle state simultaneously.
