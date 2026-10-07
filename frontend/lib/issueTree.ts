import { Issue, WorkflowState } from '@/types';

export interface IssueTreeNode {
  issue: Issue;
  parent?: Issue;
  children: Issue[];
  ancestors: Issue[];
  depth: number;
}

export interface IssueTreeIndex {
  issueMap: Map<string, Issue>;
  childrenMap: Map<string, Issue[]>;
  parentMap: Map<string, Issue>;
  rootIssues: Issue[];
  allNodes: Map<string, IssueTreeNode>;
}

export interface SwimlaneRow {
  id: string; // root parent issue id or '__independent__'
  parent: Issue | null;
  isIndependent: boolean;
  columns: Record<string, Issue[]>;
  totalCount: number;
  completedCount: number;
  completionPercent: number;
}

/**
 * Builds an indexed tree from a flat list of issues.
 * Implements cycle prevention via visited-set detection.
 */
export function buildIssueTree(issues: Issue[]): IssueTreeIndex {
  const issueMap = new Map<string, Issue>();
  const childrenMap = new Map<string, Issue[]>();
  const parentMap = new Map<string, Issue>();

  // 1. Map all issues by ID
  for (const issue of issues) {
    if (issue && issue.id) {
      issueMap.set(issue.id, issue);
      if (!childrenMap.has(issue.id)) {
        childrenMap.set(issue.id, []);
      }
    }
  }

  // 2. Build parent-child relationships
  for (const issue of issues) {
    if (issue.parent_id && issueMap.has(issue.parent_id)) {
      const parent = issueMap.get(issue.parent_id)!;
      parentMap.set(issue.id, parent);
      const siblings = childrenMap.get(issue.parent_id) || [];
      siblings.push(issue);
      childrenMap.set(issue.parent_id, siblings);
    }
  }

  // 3. Compute roots & tree nodes with ancestor paths and cycle detection
  const rootIssues: Issue[] = [];
  const allNodes = new Map<string, IssueTreeNode>();

  for (const issue of issues) {
    const ancestors = getAncestorPath(issue.id, issueMap, parentMap);
    const children = childrenMap.get(issue.id) || [];

    const isRoot = !issue.parent_id || !issueMap.has(issue.parent_id);
    if (isRoot) {
      rootIssues.push(issue);
    }

    allNodes.set(issue.id, {
      issue,
      parent: issue.parent_id ? issueMap.get(issue.parent_id) : undefined,
      children,
      ancestors,
      depth: ancestors.length,
    });
  }

  return {
    issueMap,
    childrenMap,
    parentMap,
    rootIssues,
    allNodes,
  };
}

/**
 * Returns ordered array of ancestors from top-level root down to direct parent.
 * Guarantees cycle termination using a visited Set.
 */
export function getAncestorPath(
  issueId: string,
  issueMap: Map<string, Issue>,
  parentMap: Map<string, Issue>
): Issue[] {
  const ancestors: Issue[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = issueId;

  visited.add(currentId);

  while (currentId) {
    const parent = parentMap.get(currentId);
    if (!parent || visited.has(parent.id)) {
      break;
    }
    visited.add(parent.id);
    ancestors.unshift(parent); // prepend so root is at index 0
    currentId = parent.id;
  }

  return ancestors;
}

/**
 * Recursively resolves the root ancestor ID for any issue.
 */
export function getRootAncestor(
  issue: Issue,
  issueMap: Map<string, Issue>
): Issue {
  const visited = new Set<string>([issue.id]);
  let current = issue;

  while (current.parent_id && issueMap.has(current.parent_id)) {
    const parent = issueMap.get(current.parent_id)!;
    if (visited.has(parent.id)) {
      break; // Cycle break
    }
    visited.add(parent.id);
    current = parent;
  }

  return current;
}

/**
 * Projects issues into horizontal swimlanes grouped by Root Parent issues.
 * Issues without parents or children are placed into an Independent Issues swimlane.
 */
export function buildSwimlanes(
  issues: Issue[],
  states: WorkflowState[]
): SwimlaneRow[] {
  const tree = buildIssueTree(issues);

  // Determine which root issues have descendants
  const rootDescendantsMap = new Map<string, Issue[]>();
  const independentIssues: Issue[] = [];

  // Group all issues by their root ancestor
  for (const issue of issues) {
    // If issue has a parent or has children, it belongs to its root's swimlane
    const hasChildren = (tree.childrenMap.get(issue.id) || []).length > 0;
    const hasParent = Boolean(issue.parent_id && tree.issueMap.has(issue.parent_id));

    if (!hasParent && !hasChildren) {
      independentIssues.push(issue);
      continue;
    }

    const root = getRootAncestor(issue, tree.issueMap);
    if (!rootDescendantsMap.has(root.id)) {
      rootDescendantsMap.set(root.id, []);
    }
    // Only place non-root issues (children) inside the swimlane columns,
    // unless the root issue itself is also treated as a task in that row.
    // In Linear swimlanes: child subtickets are the cards inside columns,
    // while the parent issue is the row header. If root issue has no parent,
    // children appear inside the swimlane columns.
    if (issue.id !== root.id) {
      rootDescendantsMap.get(root.id)!.push(issue);
    }
  }

  const swimlanes: SwimlaneRow[] = [];

  // Sort helper by sort_order
  const sortByRank = (a: Issue, b: Issue) => {
    return (a.sort_order || '').localeCompare(b.sort_order || '');
  };

  // Build swimlane rows for each root parent with children
  for (const [rootId, descendants] of rootDescendantsMap.entries()) {
    const rootIssue = tree.issueMap.get(rootId);
    if (!rootIssue) continue;

    const columns: Record<string, Issue[]> = {};
    for (const state of states) {
      columns[state.id] = [];
    }

    for (const desc of descendants) {
      if (columns[desc.state_id]) {
        columns[desc.state_id].push(desc);
      } else {
        // Fallback for missing state
        const firstStateId = states[0]?.id;
        if (firstStateId) {
          if (!columns[firstStateId]) columns[firstStateId] = [];
          columns[firstStateId].push(desc);
        }
      }
    }

    // Sort cards in each column
    for (const stateId of Object.keys(columns)) {
      columns[stateId].sort(sortByRank);
    }

    // Compute progress stats
    const totalCount = descendants.length;
    const completedCount = descendants.filter((d) => {
      const state = states.find((s) => s.id === d.state_id);
      return state?.category === 'completed' || d.state?.category === 'completed';
    }).length;
    const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    swimlanes.push({
      id: rootId,
      parent: rootIssue,
      isIndependent: false,
      columns,
      totalCount,
      completedCount,
      completionPercent,
    });
  }

  // Sort parent swimlanes by root issue sort_order
  swimlanes.sort((a, b) => {
    if (!a.parent || !b.parent) return 0;
    return (a.parent.sort_order || '').localeCompare(b.parent.sort_order || '');
  });

  // Build the independent issues swimlane if there are any standalone issues
  if (independentIssues.length > 0) {
    const independentColumns: Record<string, Issue[]> = {};
    for (const state of states) {
      independentColumns[state.id] = [];
    }

    for (const ind of independentIssues) {
      if (independentColumns[ind.state_id]) {
        independentColumns[ind.state_id].push(ind);
      } else {
        const firstStateId = states[0]?.id;
        if (firstStateId) {
          if (!independentColumns[firstStateId]) independentColumns[firstStateId] = [];
          independentColumns[firstStateId].push(ind);
        }
      }
    }

    for (const stateId of Object.keys(independentColumns)) {
      independentColumns[stateId].sort(sortByRank);
    }

    const totalCount = independentIssues.length;
    const completedCount = independentIssues.filter((i) => {
      const state = states.find((s) => s.id === i.state_id);
      return state?.category === 'completed' || i.state?.category === 'completed';
    }).length;
    const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    swimlanes.push({
      id: '__independent__',
      parent: null,
      isIndependent: true,
      columns: independentColumns,
      totalCount,
      completedCount,
      completionPercent,
    });
  }

  return swimlanes;
}
