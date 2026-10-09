# Plan: Convert Modals/Popups to URL-Based Routes

## Current State
Found multiple modal/popup components that render as overlays without dedicated URL routes:

#### Modal Components Identified
1. **CreateIssueModal** (`frontend/components/issues/CreateIssueModal.tsx`)
   - Renders in `frontend/app/(workspace)/[orgSlug]/[teamKey]/layout.tsx`
   - Controlled by `isNewIssueOpen` boolean state and `openCreateIssue` event
   - Triggered by `C` keyboard shortcut, sidebar button, TopNav "+ New Issue", and Kanban column "+" buttons
   - Uses issue creation data: teamId, teamKey, states, users
   - **Architectural Decision**: Intentionally preserved as an in-DOM overlay modal to maintain high-velocity creation without unmounting board DOM, scroll position, or realtime subscriptions
   - `/[orgSlug]/[teamKey]/issues/new` acts as a compatibility redirect to the board

2. **IssueDetailDrawer** (`frontend/components/issues/IssueDetailDrawer.tsx`)
   - Converted to dedicated route `/[orgSlug]/[teamKey]/issues/[issueIdentifier]`
   - Shows issue details with editing capabilities, activity logs, and subtask trees
   - Full URL support with deep linking, direct sharing, and SWR caching

3. **SettingsModal** (`frontend/components/settings/SettingsModal.tsx`)
   - Converted to dedicated route `/[orgSlug]/settings/*`
   - Workspace and Team settings management with dedicated sidebar navigation

4. **CreateTeamModal** (`frontend/components/teams/CreateTeamModal.tsx`)
   - Converted to dedicated route `/[orgSlug]/teams/new`
   - Team creation for current workspace

5. **CreateWorkspaceModal** (in `WorkspaceSidebar.tsx`)
   - Converted to dedicated route `/workspaces/new`
   - Workspace creation with initial team setup

6. **AIAssistantModal** (`frontend/components/ai/AIAssistantModal.tsx`)
   - Converted to dedicated route `/[orgSlug]/[teamKey]/ai`
   - Full conversation thread history and session state persistence

7. **CommandPalette** (`frontend/components/command/CommandPalette.tsx`)
   - Renders in `layout.tsx`
   - Controlled by `isCommandOpen` state (`Cmd+K`)
   - Global search and command palette (retained as global modal overlay)

## Design Considerations

### URL-based vs Modal Trade-offs
**Benefits of URL-based routes:**
- Browser back/forward navigation
- Direct linking/sharing
- SEO accessibility
- Bookmarkable state
- Session restoration
- Easier test coverage

**Reasons to keep CreateIssue as modal:**
- Rapid keyboard access (press `C` anywhere in the app to capture a thought)
- Zero layout teardown (keeps board scroll, column drag state, and realtime channel subscriptions active)
- High-frequency micro-task (users create multiple tickets in quick succession)
- Seamless backdrop blur overlay without route remount latency

### Final URL & Interaction Structure
```
/current/workspace/issues/new                    -> Redirects to board / trigger alias
/current/workspace/issues/{issueIdentifier}     -> IssueDetail (Standalone Page)
/current/workspace/settings                      -> Settings (org-level)
/current/workspace/{teamKey}/settings             -> Settings (team-level)
/current/workspace/teams/new                     -> CreateTeam (Standalone Page)
/current/workspace/workspaces/new                -> CreateWorkspace (Standalone Page)
/current/workspace/ai                            -> AI Assistant (Standalone Page)
```

### State Preservation
- **Issue creation**: In-DOM modal retains draft state while active; dismissed cleanly on cancel/submit
- **Issue details**: Deep-linkable via identifier, seeded instantly from SWR cache with parallel sub-resource hydration
- **Settings**: Saved directly to backend with optimistic state and validation

## Aligned Architectural Decisions (Grilling Session)

Following the user alignment session, the implementation adheres to the following decisions:
1. **Layout & Shell**: URL routes render inside the workspace layout shell with the workspace sidebar and top context fully intact.
2. **Prioritization & Modal Retention**:
   - **Retain CreateIssueModal as Overlay Modal**: Preserved as an in-DOM modal in `layout.tsx` for high-velocity task entry (Linear-style UX: `C` shortcut, TopNav, and Kanban column "+" buttons trigger instant creation without page teardown).
   - **Issue Detail URL Migration**: `/[orgSlug]/[teamKey]/issues/[issueIdentifier]` is fully migrated to a standalone page with deep linking and fast SWR hydration.
3. **Browser Navigation & History**: Soft navigation (`router.push`) is used for Issue Detail, Settings, Teams, and AI routes.
4. **Route Hierarchy & Interaction Model**:
   - Create Issue: In-DOM overlay modal in `layout.tsx` (`/[orgSlug]/[teamKey]/issues/new` serves as an alias redirect to the active issues view).
   - Issue Detail: `/[orgSlug]/[teamKey]/issues/[issueIdentifier]` (standalone page).
5. **Back / Cancel Action**: Standalone pages use `router.back()` with a fallback to `/[orgSlug]/[teamKey]/issues` if no previous history exists.
6. **Trigger Transition**:
   - In `KanbanBoard` and `IssueListView`, item selection navigates to `/[orgSlug]/[teamKey]/issues/[issueIdentifier]`.
   - TopNav "+ New Issue", sidebar "+ Issue", Kanban column "+", and global shortcut `C` trigger `CreateIssueModal` in-place.

## Implementation Plan

### Phase 1: Issue Detail URL Migration & Create Issue Modal Retention (Completed)
- [x] **1. Retain CreateIssueModal as In-DOM Overlay Modal**
  - Kept in `app/(workspace)/[orgSlug]/[teamKey]/layout.tsx` for instantaneous high-velocity task entry.
  - Triggered via global keyboard shortcut (`C`), `openCreateIssue` window events, TopNav, and Kanban column "+" buttons.
  - Passes pre-selected workflow `stateId` directly into modal state without full route unmounts.
  - On issue creation, dispatches `issueCreated` event and immediately refreshes in-memory cache and realtime board state.
  - Maintained `/[orgSlug]/[teamKey]/issues/new` as a convenience redirect route back to the active issues board.
- [x] **2. Wire Navigation & Trigger Handlers for In-Context Creation**
  - `TopNav` "New Issue" action opens modal via `openCreateIssue` custom event with default state.
  - `WorkspaceSidebar` "New Issue" action and global shortcut (`C`) trigger `handleOpenNewIssue()`.
  - `KanbanBoard` column "+" buttons pass target column `stateId` to `openCreateIssue`.
- [x] **3. Validate Issue Detail Route (`/[orgSlug]/[teamKey]/issues/[issueIdentifier]`)**
  - Enhanced back navigation to use `router.back()` with graceful fallback to `/[orgSlug]/[teamKey]/issues`.
  - Confirmed Kanban and List views route directly to `/[orgSlug]/[teamKey]/issues/[issueIdentifier]`.
  - Implemented zero-flash SWR hydration and parallel sub-resource loading.
- [x] **4. Test & Verification**
  - Verified clean TypeScript compilation (`npx tsc --noEmit` exited with code 0).
  - Confirmed board state, scroll position, and realtime sync remain intact during issue creation.

### Phase 2: Settings & Management Modals (Completed)
- [x] Create `/settings/[orgSlug]` (redirects to `/settings/workspace`) and `/settings/teams/[teamKey]` (team-level settings with workflow state & member management)
- [x] Create `/[orgSlug]/teams/new` (dedicated URL-first team creation page with auto-prefixed identifiers)
- [x] Create `/workspaces/new` (full URL workspace creation page with slug normalization and initial team onboarding)
- [x] Rewire sidebar triggers: "Create Workspace" navigates to `/workspaces/new`, "Create Team" navigates to `/[orgSlug]/teams/new`
- [x] Attached `@related-files` header tags to all newly created implementation files
- [x] Verified zero TypeScript compilation errors (`npx tsc --noEmit` exited with code 0)

### Phase 3: AI Assistant (Completed)
- [x] Integrate URL route `/[orgSlug]/[teamKey]/ai` with `conversationId` query parameter tracking (`?conversationId=...`).
- [x] Enable conversation thread management with "New Chat" action to generate fresh thread IDs and update URL query state.
- [x] Add localStorage thread history persistence and auto-restoration across sessions.
- [x] Rewire AI triggers:
  - Sidebar "AI Assistant" action button soft-routes to `/[orgSlug]/[teamKey]/ai`.
  - Global keyboard shortcut (`Cmd+J`) routes directly to `/[orgSlug]/[teamKey]/ai`.
  - Command palette AI Assistant selection soft-routes to `/[orgSlug]/[teamKey]/ai`.
- [x] Attached `@related-files` header tags.
- [x] Verified zero TypeScript compilation errors (`npx tsc --noEmit` exited with code 0).


### Technical Implementation Details

#### Issue Creation (In-DOM Modal)
```typescript
// Fast in-context overlay modal hoisted in app/(workspace)/[orgSlug]/[teamKey]/layout.tsx
// Opened via 'C' shortcut, TopNav, or Kanban column '+' without navigating away
// Preserves active board scroll, drag position, and Supabase realtime subscriptions
// /[orgSlug]/[teamKey]/issues/new acts as an alias redirect to /issues
```

#### Issue Details (`/workspace/issues/{identifier}`)
```typescript
// Server component that fetches issue data by identifier
// Uses `useEffect` to load data, manages edit state locally
// Has its own close mechanism (navigation away)
```

#### Settings (`/[orgSlug]/settings/*`)
```typescript
// Full-screen dedicated settings environment with TopNav-style header,
// interactive breadcrumbs, and "← Back to Workspace" / ESC escape hatches.
// Hydrated at workspace root via app/(workspace)/[orgSlug]/layout.tsx.
```

**Enhanced Settings Implementation:**
* **Dedicated Navigation Sidebar:**
  * **Workspace:** `/[orgSlug]/settings/workspace` — Organization Name and URL Slug (company branding/logo removed)
  * **Members:** `/[orgSlug]/settings/members` — Table with `Name`, `Email`, `Status (Membership type)`, `Teams (count)`, `Joined Date`
  * **Teams Overview:** `/[orgSlug]/settings/teams` — Table of workspace teams + "+ Create Team"
  * **Team Settings:** `/[orgSlug]/settings/teams/[teamKey]` — General Info (Name, Key Prefix) & assigned Team Members (Workflow states removed)
  * **Profile:** `/[orgSlug]/settings/profile` — Inline editable Name, optional Job Description, Account info (Theme and Security removed)
* **RBAC Enforcement**:
  * **Admin:** Edit access on workspace name, invite member form, create team action, team info editing, and adding/removing team members.
  * **Member:** View-only access with disabled inputs, hidden invite/create buttons, and view-only badges.
* **Keyboard Navigation:** `Cmd+,` toggles Settings, and `Escape` returns to the active workspace board.
* **Context Hydration:** Root `WorkspaceContext.Provider` hoisted to `app/(workspace)/[orgSlug]/layout.tsx`.

## Migration Strategy

### Incremental Rollout
1. **Phase A**: Convert lightweight modals (CreateTeam, CreateWorkspace)
2. **Phase B**: Migrate IssueDetail to URL route; retain CreateIssueModal as fast in-DOM overlay
3. **Phase C**: Update Settings and AI Assistant to dedicated URL routes

### User Experience Considerations
- Maintain familiar keyboard shortcuts
- Smooth transition between modal/URL approaches
- Preserve rapid access patterns
- Ensure mobile-friendly navigation

## Validation Plan

### Testing Approach
1. **Unit Tests**: Component isolation testing
2. **Integration Tests**: URL state management
3. **E2E Tests**: Full user workflows
4. **Accessibility**: Screen reader compatibility

### Success Criteria
- URL sharing works correctly
- Navigation flows work as expected
- Keyboard shortcuts maintained
- Performance benchmarks met
- User acceptance testing completed

### Risk Mitigation
- **Breaking changes**: Feature flags for gradual rollout
- **State loss**: LocalStorage fallback for form data
- **Performance**: Code splitting and lazy loading
- **User confusion**: Clear UI patterns and documentation

## Technologies & Tools

### Next.js Features
- App Router with dynamic routes
- Server-side rendering for issue details
- Client-side state management with Zustand/TanStack Query
- Middleware for authentication and authorization

### State Management
- URL parameters for simple state
- LocalStorage for complex form state
- API calls for persistent data
- Context providers for shared state

### Performance Optimization
- Route-based code splitting
- Server-side data loading
- Caching strategies
- Component memoization

## Timeline & Resources

### Estimated Effort
- **Analysis**: 2 days
- **Route Implementation**: 1 week
- **Migration**: 1 week
- **Optimization**: 2 days
- **Testing**: 1 week
- **Documentation**: 2 days

### Required Expertise
- Next.js/App Router
- React state management
- URL design and UX
- Performance optimization
- Testing and QA

### Dependencies
- Backend API support for URL-based routes
- Database queries optimized for identifier-based lookup
- Authentication middleware updates
- Monitoring and analytics for migration tracking

## Next Steps

### Immediate Actions (This Sprint)
1. **Create detailed design documentation** for each modal conversion
2. **Set up development environment** for parallel modal/URL implementation
3. **Create feature flag system** for gradual rollout
4. **Establish testing framework** for both approaches

### Communication Plan
- **Daily standups**: Migration progress updates
- **Weekly demos**: Working functionality
- **User feedback sessions**: Usability testing
- **Sprint reviews**: Implementation milestones

### Deliverables
- **Migration plan documentation**
- **Feature flag implementation**
- **URL-based route implementations**
- **Modal-to-URL conversion scripts**
- **Testing framework setup**
- **User documentation**
- **Performance benchmarks**

## Risk Assessment

### High Risk
- **User workflow disruption**: Migration may confuse users
- **State management complexity**: Preserving form/session state
- **Testing coverage**: Ensuring all scenarios work

### Medium Risk
- **Performance impact**: Larger bundles, slower loads
- **SEO considerations**: Proper meta tags for new routes
- **Mobile experience**: Touch interaction patterns

### Low Risk
- **Implementation complexity**: Straightforward route setup
- **Accessibility**: Following WCAG guidelines
- **Browser compatibility**: Modern browser support

## Conclusion

Converting modal/popups to URL-based routes provides significant benefits in terms of:

1. **User Experience**: Browser navigation, sharing, bookmarking
2. **Developer Experience**: Easier debugging, testing, maintenance
3. **SEO**: Search engine visibility and discoverability
4. **Product Strategy**: Consistent web application patterns

The migration requires careful planning, incremental rollout, and comprehensive testing to ensure a smooth transition that maintains the current user experience while adding the benefits of URL-based navigation.

---

**Priority**: High - Convert user-facing detail and settings modals to dedicated URL routes while retaining the fast in-context creation modal
**Dependencies**: All backend services need URL endpoint support
**Resources**: Frontend team with Next.js expertise
**Timeline**: Completed
**Stakeholders**: Product, UX, Engineering teams
