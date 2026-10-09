# Rule: Remove Unused Code and Files After Implementation

## Directive
After completing any implementation, refactor, bug fix, or migration, **always identify and remove all unused code, dead imports, obsolete components, leftover helpers, and deprecated files** across all touched and related files. Never leave orphaned code, commented-out dead blocks, or superseded files in the workspace.

## Guidelines

1. **Unused Imports & Dead Symbols**:
   - Strip out all unused imports, unreferenced variables, dead helper functions, obsolete types, and leftover hooks in modified and related files.
   - Remove unused props from component interfaces when features or triggers are retired.

2. **Orphaned & Deprecated Files**:
   - If a component, modal, hook, utility, or backend service is replaced, migrated, or rendered obsolete (e.g., converting a modal into a dedicated URL route), delete the superseded file or component instead of leaving dead artifacts in the codebase.

3. **Dead Call Sites & Event Handlers**:
   - Check all related files (parent layouts, sidebars, command palettes, top navigation, context providers, custom event listeners) for references to deprecated functions, dead custom events, or unused state handlers, and clean them up.

4. **Zero-Regression Verification**:
   - Verify that the cleanup introduced zero regressions:
     - **Frontend**: Run `npx tsc --noEmit` and relevant lint checks to verify zero missing imports or broken exports.
     - **Backend**: Run `pytest` and linter checks to ensure no broken dependencies.
