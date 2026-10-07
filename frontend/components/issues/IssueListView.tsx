'use client';

import React, { useMemo } from 'react';
import { Issue, WorkflowState, User } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';
import { buildIssueTree } from '@/lib/issueTree';

interface IssueListViewProps {
  issues: Issue[];
  states?: WorkflowState[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  onSelectIssue: (issue: Issue) => void;
}

interface FlattenedListRow {
  issue: Issue;
  depth: number;
  isLastChild: boolean;
  hasChildren: boolean;
  childrenCount: number;
  completedChildrenCount: number;
  ancestorGuides: boolean[];
}

export const IssueListView: React.FC<IssueListViewProps> = ({
  issues,
  states = [],
  users = [],
  onSelectIssue,
}) => {
  // Flatten issues into tree order so subtasks appear under parent
  const flattenedIssues = useMemo(() => {
    const tree = buildIssueTree(issues);
    const result: FlattenedListRow[] = [];

    const traverse = (items: Issue[], depth: number, guides: boolean[]) => {
      items.forEach((item, idx) => {
        const isLast = idx === items.length - 1;
        const children = tree.childrenMap.get(item.id) || [];
        const childrenCount = children.length;
        const completedChildrenCount = children.filter(
          (c) => c.state?.category === 'completed'
        ).length;

        result.push({
          issue: item,
          depth,
          isLastChild: isLast,
          hasChildren: childrenCount > 0,
          childrenCount,
          completedChildrenCount,
          ancestorGuides: [...guides],
        });

        if (childrenCount > 0) {
          traverse(children, depth + 1, [...guides, !isLast]);
        }
      });
    };

    traverse(tree.rootIssues, 0, []);
    return result;
  }, [issues]);

  return (
    <div className="flex-1 p-6 select-none overflow-x-auto font-sans">
      <div className="w-full bg-black border border-zinc-800 rounded-xl overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <div className="col-span-3">Identifier</div>
          <div className="col-span-3">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-2">Assigned to</div>
          <div className="col-span-1 text-right">Estimate</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-zinc-800">
          {flattenedIssues.map((row) => {
            const { issue, depth, isLastChild, hasChildren, childrenCount, completedChildrenCount, ancestorGuides } = row;
            const resolvedState = issue.state || (states && states.find((s) => s.id === issue.state_id));

            return (
              <div
                key={issue.id}
                onClick={() => onSelectIssue(issue)}
                className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-zinc-900 transition-colors cursor-pointer text-xs text-zinc-300 relative group"
              >
                {/* Column 1: Tree connectors + Identifier */}
                <div className="col-span-3 font-mono font-medium text-white flex items-center min-w-0">
                  {depth > 0 && (
                    <div className="flex items-center shrink-0 mr-1.5 select-none text-zinc-600 font-mono text-xs">
                      {ancestorGuides.map((hasGuide, gIdx) => (
                        <span key={gIdx} className="w-4 inline-block text-center">
                          {hasGuide ? '│' : ' '}
                        </span>
                      ))}
                      <span className="w-4 inline-block text-center text-zinc-500">
                        {isLastChild ? '└──' : '├──'}
                      </span>
                    </div>
                  )}

                  <span className="text-zinc-300 font-normal">{issue.identifier}</span>
                </div>

                {/* Column 2: Title + Subtask count badge */}
                <div className="col-span-3 font-medium text-white flex items-center gap-2 min-w-0 pr-4">
                  <span className="truncate">{issue.title}</span>
                  {childrenCount > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 font-mono shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      <span>
                        {completedChildrenCount}/{childrenCount}
                      </span>
                    </span>
                  )}
                </div>

                {/* Column 3: Status */}
                <div className="col-span-2">
                  <StateBadge state={resolvedState} />
                </div>

                {/* Column 4: Priority */}
                <div className="col-span-1">
                  <PriorityBadge priority={issue.priority} showLabel={false} />
                </div>

                {/* Column 5: Assignee */}
                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  {(() => {
                    const resolvedAssignee =
                      issue.assignee ||
                      (issue.assignee_id
                        ? (users.find(
                            (u: any) =>
                              u.id === issue.assignee_id ||
                              u.user_id === issue.assignee_id ||
                              u.user?.id === issue.assignee_id
                          ) as any)
                        : null);

                    const assigneeUser = resolvedAssignee?.user || resolvedAssignee;
                    if (!assigneeUser) {
                      return <span className="text-zinc-500 text-[10px]">Unassigned</span>;
                    }
                    const name = assigneeUser.name || assigneeUser.email || 'Member';
                    const initials =
                      name
                        .split(' ')
                        .filter(Boolean)
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase() || 'M';

                    const assignedByName =
                      issue.assigned_by?.name ||
                      issue.assigned_by?.email ||
                      issue.creator?.name ||
                      issue.creator?.email;

                    return (
                      <div
                        className="flex items-center gap-2 min-w-0"
                        title={`Assigned to: ${name}${assignedByName ? ` (by ${assignedByName})` : ''}`}
                      >
                        {assigneeUser.avatar_url ? (
                          <img
                            src={assigneeUser.avatar_url}
                            alt={name}
                            className="w-5 h-5 rounded-full object-cover ring-1 ring-zinc-700 shrink-0"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-[9px] font-bold shrink-0">
                            {initials}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-zinc-200 truncate font-medium text-xs">{name}</span>
                          {assignedByName && (
                            <span className="text-[10px] text-zinc-500 truncate">
                              by {assignedByName}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Column 6: Estimate */}
                <div className="col-span-1 text-right font-mono text-zinc-400">
                  {issue.estimate ? `${issue.estimate}p` : '—'}
                </div>
              </div>
            );
          })}

          {flattenedIssues.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-500">No matching issues found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
