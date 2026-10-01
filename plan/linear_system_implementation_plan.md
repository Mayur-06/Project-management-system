# Implementation Plan: Linear-Grade Project Management System

## 1. Executive Summary & Architectural Vision

This implementation plan outlines the production-ready architecture and execution roadmap for building a high-speed, keyboard-first **Project Management & Issue Tracking System** (inspired by Linear) using **Next.js 15 (TypeScript)**, **FastAPI (Python 3.12)**, **Supabase (PostgreSQL 16 + Realtime + Auth)**, and **LangChain / LangGraph** for agentic AI workflows.

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Frontend Client (Next.js 15 + TS)                 │
 │   App Router • Tailwind CSS • cmdk (Cmd+K) • TipTap • Optimistic Store │
 └──────────────────┬───────────────────────────────┬─────────────────────┘
                    │ HTTPS Mutations & SSE (FastAPI│ Direct Realtime & Auth Listeners
                    ▼                               ▼
 ┌──────────────────────────────────────┐      ┌──────────────────────────┐
 │       Backend API (FastAPI)          │      │     Supabase Platform    │
 │  Pydantic v2 • Async Routes • Auth   │◄────►│  PostgreSQL 16 + RLS     │
 │  Optimistic Lock (409) • Audit Logs  │      │  Realtime Broadcast / CDC│
 └──────────────────┬───────────────────┘      │  Supabase Auth & Storage │
                    │                          │  pgvector (Embeddings)   │
                    ▼                          │  AsyncPostgresSaver (LG) │
 ┌──────────────────────────────────────┐      └──────────────────────────┘
 │      AI Agent Engine (LangGraph)     │                   ▲
 │  ReAct Chat Agent • Triage Agent     │───────────────────┘
 │  Breakdown Agent • Async Tools       │   Semantic Search / pgvector
 └──────────────────────────────────────┘
```

### Architectural Principles & Write-Path Rule
* **Single Authoritative Write Path:** The Next.js frontend **never** mutates database tables directly via PostgREST. All mutations (`POST`, `PATCH`, `PUT`, `DELETE`) flow strictly through FastAPI to guarantee server-side schema validation, activity audit logging, and atomic transactions.
* **Supabase Client in Frontend:** Restricted exclusively to:
  1. **Authentication Session Management:** (`supabase.auth.getSession()`, OAuth flows).
  2. **Realtime Channels:** Multi-client live synchronization via Realtime Broadcast & Postgres Changes with client-side echo suppression.
* **Server-Sent Events (SSE) Streaming:** All streaming endpoints (`/ai/chat/stream`) utilize `POST` with `@microsoft/fetch-event-source` or native `fetch` + `ReadableStream`, providing custom headers (`Authorization: Bearer <jwt>`), JSON payloads, and clean `AbortController` cancellation.

---

## 2. Dedicated Technology Stack

| Layer | Technology | Role & Integration |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 15 (App Router) + TypeScript** | High-performance UI, Server Components for initial shell, client-side optimistic rendering. |
| **Styling & Components** | **shadcn/ui + Tailwind CSS + Lucide Icons** | Accessible UI primitives (Dialog, DropdownMenu, Tabs, Popover, Sheet, Command, Badge). |
| **State Management** | **Zustand + TanStack Query v5** | Zero-latency local optimistic state updates with rollback on network/409 conflict errors. |
| **Editor & Keyboard** | **TipTap Editor + `cmdk`** | Rich markdown issue editor with slash commands; universal `Cmd+K` command palette & hotkeys. |
| **Backend API** | **FastAPI (Python 3.12) + Pydantic v2** | Asynchronous REST API, concurrency lock management, activity auditing, and SSE streaming. |
| **Database & Auth** | **Supabase (PostgreSQL 16)** | Multi-tenant RLS, Supabase Auth (JWT/OAuth), Supabase Storage, and `pgvector`. |
| **Realtime Engine** | **Supabase Realtime (Broadcast + CDC)** | Scoped Broadcast channels for sub-50ms collaborative board updates with fallback to Postgres CDC. |
| **Vector Database** | **Supabase `pgvector`** | Vector embeddings (`VECTOR(768)`) with HNSW index and `hnsw.iterative_scan` for multi-tenant isolation. |
| **AI Framework** | **LangChain & LangGraph** | Cyclic stateful agent workflows with PostgreSQL checkpointing (`AsyncPostgresSaver`) and Human-in-the-Loop (`interrupt()`). |

---

## 3. Production Database Schema & Supabase Architecture

### A. Complete Relational Schema (PostgreSQL on Supabase)

```sql
-- Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Organizations (Tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Workspace Members & Role Hierarchy
CREATE TYPE member_role AS ENUM ('admin', 'member', 'guest');

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role member_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- 3. Teams (e.g., Engineering "ENG", Product "PROD")
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key VARCHAR(10) NOT NULL,
    issue_counter INT DEFAULT 0 NOT NULL,
    cycle_duration_weeks INT DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, key)
);

-- 4. Team Memberships
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- 5. Standard Fixed Workflow States (Triage, Backlog, Unstarted, Started, Completed, Canceled)
CREATE TYPE state_category AS ENUM ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled');

CREATE TABLE workflow_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL,
    category state_category NOT NULL,
    position VARCHAR(255) COLLATE "C" NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, category) -- Enforces exactly one instance per fixed category per team
);

-- 6. Cycles (Sprints)
CREATE TABLE cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    number INT NOT NULL,
    name VARCHAR(255),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, number)
);

-- 7. Projects & Milestones
CREATE TYPE project_health AS ENUM ('on_track', 'at_risk', 'off_track');

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    health project_health DEFAULT 'on_track',
    sort_order VARCHAR(255) COLLATE "C" NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE TABLE project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    target_date DATE,
    completed_at TIMESTAMPTZ,
    sort_order VARCHAR(255) COLLATE "C" NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Labels
CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- 9. Issues (Core Entity)
CREATE TYPE issue_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');

CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    number INT,
    identifier VARCHAR(30),
    title VARCHAR(500) NOT NULL,
    description_json JSONB,
    description_text TEXT,
    priority issue_priority DEFAULT 'none' NOT NULL,
    estimate INT,
    state_id UUID NOT NULL REFERENCES workflow_states(id),
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    creator_id UUID NOT NULL REFERENCES auth.users(id),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    sort_order VARCHAR(255) COLLATE "C" NOT NULL,
    version INT DEFAULT 1 NOT NULL,
    last_modified_by_session VARCHAR(100),
    due_date DATE,
    snoozed_until TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(team_id, number)
);

-- 10. Issue Labels Join Table
CREATE TABLE issue_labels (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

-- 11. Issue Comments & Emoji Reactions
CREATE TABLE issue_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body_json JSONB NOT NULL,
    body_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES issue_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id, emoji)
);

-- 13. File Attachments
CREATE TABLE issue_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    file_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Activity Audit Logs
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. pgvector Semantic Embeddings
CREATE TABLE issue_embeddings (
    issue_id UUID PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    embedding VECTOR(768),
    embedding_model VARCHAR(50) DEFAULT 'gemini-embedding-001',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### B. Indexes & RLS Policies (With `hnsw.iterative_scan`)

```sql
-- 1. Indexes
CREATE INDEX idx_issues_board_sort ON issues (team_id, state_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_org_id ON issues (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_assignee_id ON issues (assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_cycle_id ON issues (cycle_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_project_id ON issues (project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_parent_id ON issues (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_identifier ON issues (identifier);

CREATE INDEX idx_issue_embeddings_hnsw ON issue_embeddings 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- 2. RLS for issue_embeddings
ALTER TABLE issue_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can query embeddings in their org"
ON issue_embeddings FOR SELECT
USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Members and admins can manage embeddings"
ON issue_embeddings FOR ALL
USING (organization_id IN (SELECT get_user_org_ids()));

-- 3. Match Function with Iterative Scan Configuration
CREATE OR REPLACE FUNCTION match_similar_issues(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    p_organization_id UUID
)
RETURNS TABLE (
    issue_id UUID,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ensure multi-tenant filtered query does not get truncated by global HNSW limits
    SET LOCAL hnsw.iterative_scan = 'relaxed_order';
    
    RETURN QUERY
    SELECT 
        ie.issue_id,
        1 - (ie.embedding <=> query_embedding) AS similarity
    FROM issue_embeddings ie
    WHERE ie.organization_id = p_organization_id
      AND 1 - (ie.embedding <=> query_embedding) >= match_threshold
    ORDER BY ie.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

---

## 4. Complete API Endpoints Specification

All endpoints are versioned under `/api/v1` and protected by Supabase JWT Bearer authentication headers, mapping authenticated users to their corresponding organization tenant via RLS.

### 🏢 Workspaces, Teams & Members
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/me` | Fetch authenticated user's organizations, teams, and role memberships. |
| `POST` | `/api/v1/workspaces` | Create a new organization workspace. |
| `GET` | `/api/v1/workspaces/{org_slug}/teams` | List all teams within an organization. |
| `POST` | `/api/v1/workspaces/{org_slug}/teams` | Create a new team (with custom identifier key, e.g., `ENG`). |
| `GET` | `/api/v1/teams/{team_id}/members` | List members and assignable users for a specific team. |
| `GET` | `/api/v1/teams/{team_id}/states` | List the 6 fixed workflow states for a team in system display order. |

### 📌 Issues & Sub-Issues
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/issues` | Filtered list of issues (query params: `team_id`, `state_id`, `assignee_id`, `cycle_id`, `project_id`, `priority`, `search`). |
| `POST` | `/api/v1/issues` | Create a new issue (auto-generates identifier like `ENG-104`, initial sort order). |
| `GET` | `/api/v1/issues/{issue_id_or_key}` | Retrieve issue details by UUID or readable key (`ENG-104`). |
| `PATCH` | `/api/v1/issues/{issue_id}` | Update issue properties with optimistic locking (`expected_version` check; raises 409 on conflict). |
| `DELETE` | `/api/v1/issues/{issue_id}` | Soft delete an issue (`deleted_at = NOW()`), cascading to children via trigger. |
| `PUT` | `/api/v1/issues/{issue_id}/reorder` | Reorder issue in Kanban column or List view using LexoRank / fractional index. |
| `POST` | `/api/v1/issues/batch-reorder` | Atomically reorder a list of issues via PostgreSQL RPC (`batch_reorder_issues`). |
| `POST` | `/api/v1/issues/batch-update` | Apply bulk updates to selected issues (bulk status change, assign, delete). |
| `GET` | `/api/v1/issues/{issue_id}/subtasks` | Retrieve all child sub-issues for an issue. |
| `POST` | `/api/v1/issues/{issue_id}/subtasks` | Create a new sub-issue under a parent issue. |
| `GET` | `/api/v1/issues/{issue_id}/activity` | Fetch chronological activity audit log and changesets for an issue. |

### 💬 Comments & Reactions
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/issues/{issue_id}/comments` | List all comments and nested replies for an issue. |
| `POST` | `/api/v1/issues/{issue_id}/comments` | Post a rich-text comment (supports TipTap JSON, user `@mentions`). |
| `PATCH` | `/api/v1/comments/{comment_id}` | Edit an existing comment. |
| `DELETE` | `/api/v1/comments/{comment_id}` | Delete a comment. |
| `POST` | `/api/v1/comments/{comment_id}/reactions` | Add or toggle an emoji reaction on a comment. |

### 🔄 Cycles (Sprints)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/teams/{team_id}/cycles` | List active, upcoming, and past completed cycles. |
| `POST` | `/api/v1/teams/{team_id}/cycles` | Manually create a custom cycle. |
| `GET` | `/api/v1/cycles/{cycle_id}` | Get cycle detail, velocity metrics, burnup/burndown chart data. |
| `POST` | `/api/v1/cycles/{cycle_id}/complete` | Close active cycle, calculate velocity, and trigger auto-rollover of unfinished tasks. |
| `POST` | `/api/v1/cycles/{cycle_id}/transfer-issues` | Move unfinished issues from a completed cycle to backlog or next cycle. |

### 🗺️ Projects & Milestones
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/organizations/{org_slug}/projects` | List all projects with progress percentage, health status, and milestone counts. |
| `POST` | `/api/v1/organizations/{org_slug}/projects` | Create a new project container. |
| `GET` | `/api/v1/projects/{project_id}` | Get project overview, milestones, and linked issues. |
| `PATCH` | `/api/v1/projects/{project_id}` | Update project metadata or direct health status (`on_track`, `at_risk`, `off_track`). |
| `POST` | `/api/v1/projects/{project_id}/milestones` | Create a milestone checkpoint for the project. |
| `PATCH` | `/api/v1/milestones/{milestone_id}` | Update milestone checkpoint details or set `completed_at`. |

### 📥 Triage Inbox
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/teams/{team_id}/triage` | Fetch all un-triaged issues in the team's triage inbox. |
| `POST` | `/api/v1/triage/{issue_id}/accept` | Accept triage issue, assign to state/cycle/assignee. |
| `POST` | `/api/v1/triage/{issue_id}/snooze` | Snooze triage issue until a future timestamp. |
| `POST` | `/api/v1/triage/{issue_id}/decline` | Decline / cancel triage issue with a recorded reason. |

### 🤖 AI Endpoints Matrix (LangGraph + pgvector)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/ai/duplicates/check` | Lightweight vector-only duplicate search during issue drafting (fast, no LLM cost). |
| `POST` | `/api/v1/ai/triage/classify` | Full LangGraph categorization (Priority, Team, Labels, Points, Assignee) on submit or demand. |
| `POST` | `/api/v1/ai/breakdown/start` | Initiates technical decomposition and halts at `interrupt()` with proposed sub-tasks. |
| `POST` | `/api/v1/ai/breakdown/resume` | Resumes LangGraph breakdown with user-approved sub-tasks and batch-inserts child issues. |
| `POST` | `/api/v1/ai/chat/stream` | Server-Sent Events (SSE) stream for Linear Ask ReAct agent with tool execution. |

### 📁 Attachments & Storage
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/attachments/upload-url` | Generate signed upload URL for direct client-to-Supabase Storage uploads. |
| `DELETE` | `/api/v1/attachments/{attachment_id}` | Delete uploaded file attachment and remove DB reference. |

---

## 5. Phased Implementation Roadmap

* **Phase 1 (Foundation & Security):** 15-table DB schema, `SECURITY DEFINER` atomic trigger, RLS policies, Next.js SSR Auth, and FastAPI JWT middleware.
* **Phase 2 (Core Issue Engine):** LexoRank RPC, fixed 6 workflow states (`Triage`, `Backlog`, `Unstarted`, `Started`, `Completed`, `Canceled`), TipTap slash commands, activity audit log.
* **Phase 3 (Fast UI & Realtime):** Virtualized table/board (`@dnd-kit`), `cmdk` hotkeys, Supabase Realtime Broadcast + echo suppression.
* **Phase 4 (AI Automation Fleet):** Draft duplicate check, full LangGraph Triage, LangGraph Breakdown with `interrupt()` and `AsyncPostgresSaver`, ReAct Chat agent.
* **Phase 5 (Testing & Hardening):** Concurrency conflict validation, automated testing suite (`pgTAP`, concurrency, LexoRank), performance benchmarking.
