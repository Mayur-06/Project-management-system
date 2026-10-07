# Rule: Grill Me to Align on a Plan Before Writing Any Code

## Directive
Before writing, modifying, or generating any code for a task or feature, **always conduct an interactive alignment session ("Grill me")** with the user to thoroughly challenge assumptions, explore edge cases, and finalize design decisions.

## Guidelines
1. **Never Jump Straight to Code**:
   - When asked to implement a new feature, migration, or non-trivial change, pause and formulate targeted, probing questions about architecture, UX trade-offs, state management, backwards compatibility, and edge cases.
2. **Surface Ambiguities & Trade-offs**:
   - Present concrete alternatives with explicit pros/cons instead of accepting vague specifications.
   - Clarify data flows, URL structures, error states, and fallback behavior.
3. **Plan Alignment**:
   - Update or establish the plan in `.kilo/plans/` (or designated plan directory) reflecting all decisions made during the grilling session.
4. **Explicit Approval Required**:
   - Code writing begins only after the user has reviewed and approved the aligned plan.
