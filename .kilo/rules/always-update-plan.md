# Rule: Always Update the Plan File After Each New Implementation or Change

## Directive
After completing any implementation step, code change, bug fix, or refactor, **always update the active plan file** to reflect the actual state of the codebase.

## Guidelines
1. **Identify the Active Plan**:
   - Check `.kilo/plans/` (e.g., active migration/feature plans such as `modal-to-url-migration.md`), `.kilo/plan2/`, or `plan/` for the relevant plan document corresponding to the current task.
2. **Update Progress & Status**:
   - Mark completed checklist items, steps, or milestones as completed (`[x]`).
   - Add notes if deviations or refinements were made during implementation.
3. **Keep as Ground Truth**:
   - Update API contracts, route structures, component hierarchies, or schemas in the plan so it reflects runtime reality rather than outdated draft proposals.
4. **Immediate Execution**:
   - Plan updates must be executed immediately following code changes.
