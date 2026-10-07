# Rule: Sync plan2 After Implementation

After every implementation, update the `.kilo/plan2/` files to reflect the actual built state.

Specifically:
- `.kilo/plan2/linear_system_implementation_plan.md` — update API endpoints, database schema, and frontend pages to match what was actually implemented.
- `.kilo/plan2/linear_ai_agents_implementation_plan.md` — update agent graphs, node implementations, tool bindings, and SSE streaming contracts to match the runtime reality.

Do not leave `.kilo/plan2/` as a forward-looking draft. It must remain the source of truth for the current codebase.
