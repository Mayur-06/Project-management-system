# Plan: Convert Modals/Popups to URL-Based Routes

## Current State
Found multiple modal/popup components that render as overlays without dedicated URL routes:

### Modal Components Identified
1. **CreateIssueModal** (`frontend/components/issues/CreateIssueModal.tsx`)
   - Renders in `frontend/app/(workspace)/[orgSlug]/[teamKey]/layout.tsx`
   - Controlled by `isNewIssueOpen` boolean state
   - Triggered by `Cmd+C` keyboard shortcut, sidebar button
   - Uses issue creation data: teamId, teamKey, states, users
   - No native URL route for direct issue creation

2. **IssueDetailDrawer** (`frontend/components/issues/IssueDetailDrawer.tsx`)
   - Renders in `frontend/app/(workspace)/[orgSlug]/[teamKey]/issues/page.tsx`
   - Controlled by `issue` prop (currently null/undefined)
   - No URL parameter-based issue selection
   - Shows issue details with editing capabilities
   - Should have dedicated `/issues/{issueIdentifier}` route

3. **SettingsModal** (`frontend/components/settings/SettingsModal.tsx`)
   - Renders in `WorkspaceSidebar.tsx`
   - Controlled by `isSettingsOpen` state
   - Workspace/Team settings management
   - Should have `/settings/{orgSlug}/{teamKey?}` route

4. **CreateTeamModal** (`frontend/components/teams/CreateTeamModal.tsx`)
   - Renders in `WorkspaceSidebar.tsx`
   - Controlled by `isCreateTeamOpen` state
   - Team creation for current workspace
   - Should have `/teams/new` route

5. **CreateWorkspaceModal** (in `WorkspaceSidebar.tsx`)
   - Renders in `WorkspaceSidebar.tsx`
   - Controlled by `isCreateWorkspaceOpen` state
   - Workspace creation with team setup
   - Should have `/workspaces/new` route

6. **AIAssistantModal** (`frontend/components/ai/AIAssistantModal.tsx`)
   - Renders in `layout.tsx`
   - Controlled by `isAIAskOpen` state
   - AI workspace assistant with conversation history
   - Should have `/ai-assistant` route with conversation ID

7. **CommandPalette** (`frontend/components/command/CommandPalette.tsx`)
   - Renders in `layout.tsx`
   - Controlled by `isCommandOpen` state
   - Global search and command palette
   - Could stay as modal since it's global/global context dependent

## Design Considerations

### URL-based vs Modal Trade-offs
**Benefits of URL-based routes:**
- Browser back/forward navigation
- Direct linking/sharing
- SEO accessibility
- Bookmarkable state
- Session restoration
- Easier test coverage

**Reasons to keep as modals:**
- Global overlay (affects entire layout)
- Context-dependent (tied to workspace/team)
- Frequently accessed (quick tasks)
- Part of main workspace experience

### Proposed URL Structure
```
/current/workspace/issues/new                    -> CreateIssueModal
/current/workspace/issues/{issueIdentifier}     -> IssueDetailDrawer  
/current/workspace/settings                      -> SettingsModal (org-level)
/current/workspace/{teamKey}/settings             -> SettingsModal (team-level)
/current/workspace/teams/new                     -> CreateTeamModal
/current/workspace/workspaces/new                -> CreateWorkspaceModal
/current/workspace/ai-assistant/{conversationId}  -> AIAssistantModal
```

### State Preservation
- **Issue creation**: Maintain form state in URL via query params (`?teamId=...&sourceTeamId=...`)
- **Issue details**: Preserve view state in localStorage or server-side hydration
- **Settings**: Save changes on unmount with localStorage backup

## Aligned Architectural Decisions (Grilling Session)

Following the user alignment session, the implementation adheres to the following decisions:
1. **Layout & Shell**: URL routes render inside the workspace layout shell with the workspace sidebar and top context fully intact.
2. **Prioritization**: Phase 1 targets **Issue Detail & Create Issue** (`/[orgSlug]/[teamKey]/issues/[issueIdentifier]` and `/[orgSlug]/[teamKey]/issues/new`).
3. **Browser Navigation & History**: Soft navigation (`router.push`) is used so browser Back/Forward operates seamlessly.
4. **Route Hierarchy**:
   - Create Issue: `/[orgSlug]/[teamKey]/issues/new` (receives query parameters such as `?stateId=...` for default state selection).
   - Issue Detail: `/[orgSlug]/[teamKey]/issues/[issueIdentifier]` (already standalone page, fully hooked up to board/list clicks).
5. **Back / Cancel Action**: Uses `router.back()` with a fallback to `/[orgSlug]/[teamKey]/issues` if no previous history exists.
6. **Trigger Transition**:
   - In `KanbanBoard` and `IssueListView`, item selection navigates to `/[orgSlug]/[teamKey]/issues/[issueIdentifier]`.
   - TopNav "+ New Issue", sidebar "+ Issue", and Kanban state column "+" navigate to `/[orgSlug]/[teamKey]/issues/new` (optionally with `?stateId=...`).
   - Retain modal components as fallbacks if needed until migration is validated.

## Implementation Plan

### Phase 1: Issue Detail & Issue Creation URL Migration (Current Focus)
- [x] **1. Create Issue Route (`/[orgSlug]/[teamKey]/issues/new/page.tsx`)**
  - Rendered dedicated page inside the workspace layout shell.
  - Reads query parameters (`stateId`) to pre-select workflow state.
  - Back/Cancel buttons navigate via `router.back()` with fallback to `/[orgSlug]/[teamKey]/issues`.
  - On issue creation, dispatches `issueCreated` event and navigates to `/[orgSlug]/[teamKey]/issues/${newIssue.identifier}`.
  - Includes `@related-files` header tags for upstream dependency tracking.
- [x] **2. Wire Navigation Triggers to `/issues/new`**
  - Updated `TopNav` "New Issue" action on issues page to route to `/[orgSlug]/[teamKey]/issues/new` (with default state query param).
  - Updated `WorkspaceSidebar` "New Issue" action and global keyboard shortcut (`C`) in `layout.tsx` to route to `/[orgSlug]/[teamKey]/issues/new`.
  - Updated `KanbanBoard` column "+" buttons to pass `stateId` query param: `/[orgSlug]/[teamKey]/issues/new?stateId=${state.id}`.
- [x] **3. Validate Issue Detail Route (`/[orgSlug]/[teamKey]/issues/[issueIdentifier]`)**
  - Enhanced back navigation to use `router.back()` with graceful fallback to `/[orgSlug]/[teamKey]/issues`.
  - Confirmed Kanban and List views route directly to `/[orgSlug]/[teamKey]/issues/[issueIdentifier]`.
- [x] **4. Test & Verification**
  - Verified clean TypeScript compilation (`npx tsc --noEmit` exited with code 0).
  - Preserved legacy modal as non-breaking fallback.

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

#### Issue Creation (`/workspace/issues/new`)
```typescript
// Page component that renders CreateIssueModal internally
// Receives query params: ?teamId=...&sourceTeamId=...&initialStateId=...
// Maintains modal state via URL params when needed
```

#### Issue Details (`/workspace/issues/{identifier}`)
```typescript
// Server component that fetches issue data by identifier
// Uses `useEffect` to load data, manages edit state locally
// Has its own close mechanism (navigation away)
```

#### Settings (`/workspace/settings/{orgSlug?}`)
```typescript
// Combines org-level and team-level settings access
// Persistent across sessions via API calls
// Modal becomes internal detail
```

**Enhanced Settings Implementation:**
* **Three-section sidebar navigation:**
  * **Workspace:** Organization-level settings (name, slug, logo, company branding)
  * **Members:** Team member management (roles, invitations, permissions)
  * **Profile:** User profile and preferences (avatar, name, theme, notifications)
* **URL Pattern:** `/workspace/{orgSlug}/settings/{section}`
  * `/workspace/{orgSlug}/settings/workspace` (Organization settings)
  * `/workspace/{orgSlug}/settings/members` (Team members)
  * `/workspace/{orgSlug}/settings/profile` (User profile)
* **Team-specific settings:** `/workspace/{orgSlug}/{teamKey}/settings/` for team-level access
* **Sidebar navigation:** Left sidebar with active states for each section
* **Full page experience:** Settings rendered as dedicated pages with navigation sidebar
* **State preservation:** Form data saved on unmount/URL changes
* **Access control:** Proper authorization checks for each section
* **Modal replaced:** No longer a modal overlay, now a full page route

## Migration Strategy

### Incremental Rollout
1. **Phase A**: Convert lightweight modals (CreateTeam, CreateWorkspace)
2. **Phase B**: Migrate CreateIssue and IssueDetail
3. **Phase C**: Update Settings and AI Assistant

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

**Priority**: High - Convert most critical user-facing modals to URL routes
**Dependencies**: All backend services need URL endpoint support
**Resources**: Frontend team with Next.js expertise
**Timeline**: 4 weeks for full migration
**Stakeholders**: Product, UX, Engineering teams
