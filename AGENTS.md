# AGENTS.md — Global System Prompt & Architectural Blueprint

This document serves as the global fallback system prompt, execution rubric, and architectural blueprint for all autonomous coding agents, pair programmers, and subagents operating within this workspace.

---

## 1. Project Stack & Architecture

- **Frontend Framework:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4, Lucide React, and Radix UI primitives (`@supabase/ssr` for auth and server-side state hydration).
- **Backend & Database:** FastAPI (Python 3.12, Uvicorn, Pydantic v2) asynchronous service paired with Supabase PostgreSQL (direct session port `5432` for LangGraph checkpointers, transaction pooler port `6543`, `pgvector` for vector similarity search, and Supabase Auth).
- **AI Orchestration:** Stateful cyclical multi-agent workflows orchestrated using LangGraph and LangChain Core, utilizing `AsyncPostgresSaver` with `psycopg_pool.AsyncConnectionPool` for persistent session state checkpoints, human-in-the-loop (HITL) approval gates, and Server-Sent Events (SSE) streaming via `@microsoft/fetch-event-source`.
- **Core Models:** Google Gemini ecosystem via `google-genai` / `google-generativeai`:
  - Primary LLM: `gemini-2.5-flash` for agent reasoning, structured classification, ticket triage, and breakdown.
  - Embedding Model: `text-embedding-004` (768-dimensional vector representations stored in PostgreSQL `pgvector`).

---

## 2. Global Execution & Orchestration Rules

- **Pre-Build Verification:** Before writing code for any major feature or file mutation, you must run a discovery routine to agree on an implementation plan. 
  - Thoroughly inspect relevant codebase schemas, types, APIs, and existing implementations.
  - Formulate and validate a concrete architectural plan, establishing verification criteria before making modifications.
  - Prevent regressions across frontend components, database schemas, and FastAPI endpoints by aligning on design decisions upfront.
- **Context Exclusion:** Never read, scan, index, or modify files inside `.next/`, `node_modules/`, `out/`, `build/`, or `.git/`.
  - Treat all build outputs, packaged artifacts, and version control internals as strictly out-of-scope for agent context and tool inspection.
  - Filter directory listing and grep routines to bypass these directories to protect token budgets and prevent context pollution.
- **Precedence Rule:** Explicitly note that localized rules files located within the `.antigravity/rules/` directory take absolute priority over this global fallback file.
  - When localized rule configurations or directory-specific instructions conflict with instructions in `AGENTS.md`, agents must prioritize the localized rules.
  - Global guidelines in this file serve as defaults when no scoped override exists.

---

## 3. Tech-Specific Constraints

- **State & Realtime Sync:** All live updates, issue states, and streaming components must strictly leverage Supabase WebSockets. 
  - Real-time client updates (ticket status changes, collaborative cycle updates, live agent activity indicators) must bind to Supabase Realtime channels (`supabase.channel(...)`).
  - Do not introduce ad-hoc polling intervals, long-polling loops, or duplicate custom WebSocket servers where Supabase Realtime primitives apply.
- **Code Quality:** Run all native project formatters and linters to resolve compilation warnings before surfacing final code diffs to the user.
  - Frontend: Execute ESLint and TypeScript typecheck (`npm run lint` / `tsc --noEmit`) to verify zero TypeScript errors or lint violations.
  - Backend: Validate Python formatting and types using `pytest`, `ruff`/`flake8`, and Pydantic schema validation.
  - Resolve all diagnostic issues, missing imports, and compilation warnings before marking tasks as complete.
