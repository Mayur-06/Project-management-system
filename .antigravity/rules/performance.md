# Performance & Hydration Architecture Rules

## 1. Development Server & Bundling (Next.js 16)
- **Turbopack Invariant:** The default frontend dev script must be `next dev` (Turbopack). Never force `next dev --webpack` unless temporarily isolating a bundler-specific issue via the fallback script `dev:webpack`.
- **Package Import Optimization:** Always maintain `experimental.optimizePackageImports` in `next.config.ts` for heavy barrel libraries:
  - `lucide-react`
  - `@radix-ui/react-*` components
  - `@tiptap/react`
  This eliminates 20s–40s on-demand JIT compilation stalls when visiting deep dynamic routes (`/ai`, `/inbox`, `/issues/[issueIdentifier]`).

## 2. React 19 SSR Hydration Invariants
- **Identical Initial Render:** The initial server-rendered HTML and client-rendered HTML must match 100%.
- **Client Storage Rules:** Never read `localStorage` or `sessionStorage` inside initial `useState(...)` calls (e.g. `useState(() => localStorage.getItem(...))`).
- **Hydration Pattern:** Always hydrate client-side caches inside `useEffect(...)` after mount.
- **Suppression:** Apply `suppressHydrationWarning` strictly to dynamic leaf text elements (like workspace title or user profile text) where stored client values may legitimately differ from server defaults.

## 3. Client Data Fetching & SWR Transitions
- **In-Memory Cache:** All read endpoints in `lib/api.ts` must use Stale-While-Revalidate (`fetchWithAuthSWR`) with in-flight deduplication.
- **Instant Transitions:** Navigating between board, list, and issue detail views must render in **0ms** from cache (`api.getCachedIssues`, `api.getCachedIssue`) without full-screen loading skeleton flash, revalidating seamlessly in the background.
- **Cache Invalidation:** Any mutation (`createIssue`, `updateIssue`, `deleteIssue`, `reorderIssue`) must immediately update local cache records and call `api.invalidateCache(...)`.

## 4. Backend Supabase Auth & Admin Services
- **Authoritative Service Role:** Any routine querying `auth.admin.*` (e.g. `get_user_by_id`, user metadata resolution) must strictly use `get_supabase_admin()` configured with `SUPABASE_SERVICE_ROLE_KEY`.
- **No User Client for Admin APIs:** Never call `auth.admin.*` using user-scoped clients (`get_db_client`), which will fail with Gotrue `403 Forbidden: User not allowed`.
- **Resolution Caching:** User metadata resolution (`resolve_user_info`) must always maintain an in-memory dictionary cache (`_USER_INFO_CACHE`) to resolve subsequent lookups in **0.00ms** and eliminate redundant remote HTTP calls.
