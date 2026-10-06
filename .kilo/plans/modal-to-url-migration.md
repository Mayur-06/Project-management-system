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

## Implementation Plan

### Phase 1: Analysis & Baseline (Week 1)
1. Identify all modal close conditions (escape key, backdrop click, etc.)
2. Map current data flow and dependencies
3. Determine which modals can be safely URL-based
4. Create decision matrix for URL vs Modal approach

### Phase 2: URL Route Implementation (Week 2)
1. Create Next.js pages for each URL-based route
2. Convert modal state to query parameters for form data
3. Implement data loading/server-side rendering where possible
4. Add fallback handling for direct navigation

### Phase 3: Migration Strategy (Week 3)
1. Feature flag system for gradual rollout
2. Maintain modal as fallback for existing behavior
3. Migrate user interactions progressively
4. Test both approaches side-by-side

### Phase 4: Optimization & Cleanup (Week 4)
1. Remove redundant modal state management
2. Clean up shared state between modal/URL implementations
3. Optimize performance and bundle size
4. Update documentation and routing

### Dependencies & Constraints
- **Authentication**: All routes require workspace/team membership
- **Routing**: Update `WorkspaceSidebar` and `layout.tsx` navigation
- **API**: Ensure all backend endpoints support URL-based access
- **State**: Migrate form/selection state between modal/URL implementations

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
