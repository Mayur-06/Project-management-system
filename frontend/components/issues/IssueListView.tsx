'use client';

import React from 'react';
import { Issue, WorkflowState, User } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

interface IssueListViewProps {
  issues: Issue[];
  states?: WorkflowState[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  onSelectIssue: (issue: Issue) => void;
}

export const IssueListView: React.FC<IssueListViewProps> = ({
  issues,
  states = [],
  users = [],
  onSelectIssue,
}) => {
  return (
    <div className="flex-1 p-6 select-none overflow-x-auto font-sans">
      <div className="w-full bg-black border border-zinc-800 rounded-xl overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <div className="col-span-2">Identifier</div>
          <div className="col-span-4">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-2">Assigned to</div>
          <div className="col-span-1 text-right">Estimate</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-zinc-800">
          {issues.map((issue) => {
            const resolvedState = issue.state || (states && states.find((s) => s.id === issue.state_id));

            return (
              <div
                key={issue.id}
                onClick={() => onSelectIssue(issue)}
                className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-zinc-900 transition-colors cursor-pointer text-xs text-zinc-300"
              >
                <div className="col-span-2 font-mono font-medium text-white flex items-center gap-1.5 flex-wrap">
                  <span>{issue.identifier}</span>
                </div>
                <div className="col-span-4 font-medium text-white truncate pr-4">{issue.title}</div>
                <div className="col-span-2">
                  <StateBadge state={resolvedState} />
                </div>
                <div className="col-span-1">
                  <PriorityBadge priority={issue.priority} showLabel={false} />
                </div>
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
                <div className="col-span-1 text-right font-mono text-zinc-400">
                  {issue.estimate ? `${issue.estimate}p` : '—'}
                </div>
              </div>
            );
          })}

          {issues.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-500">No matching issues found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
