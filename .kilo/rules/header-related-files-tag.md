# Rule: Header Reference Tags on Created Implementation Files

## Directive
Every new implementation file created must include header comment tags listing all related or prerequisite files visited/referenced during its analysis and design.

## Purpose
Enables future agents or developers inspecting this implementation to immediately identify and traverse related upstream dependencies, schema definitions, and sibling components without redundant discovery scans.

## Header Format

### TypeScript / TSX / JavaScript:
```typescript
/**
 * @related-files:
 * - path/to/visited/file1.ts
 * - path/to/visited/file2.tsx
 */
```

### Python:
```python
# @related-files:
# - path/to/visited/file1.py
# - path/to/visited/file2.py
```
