'use client';

import React from 'react';
import { Repeat } from 'lucide-react';
import { Issue, Cycle } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

interface IssueListViewProps {
  issues: Issue[];
  cycles?: Cycle[];
  users?: { id: string; name?: string; email?: string; avatar_url?: string }[];
  onSelectIssue: (issue: Issue) => void;
}

export const IssueListView: React.FC<IssueListViewProps> = ({
  issues,
  cycles = [],
  users = [],
  onSelectIssue,
}) => {
  return (
    <div className="flex-1 p-6 select-none overflow-x-auto font-sans">
      <div className="w-full bg-black border border-zinc-800 rounded-xl overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <div className="col-span-2">Identifier</div>
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-1">Assignee</div>
          <div className="col-span-1 text-right">Estimate</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-zinc-800">
          {issues.map((issue) => (
            <div
              key={issue.id}
              onClick={() => onSelectIssue(issue)}
              className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-zinc-900 transition-colors cursor-pointer text-xs text-zinc-300"
            >
              <div className="col-span-2 font-mono font-medium text-white flex items-center gap-1.5 flex-wrap">
                <span>{issue.identifier}</span>
                {(() => {
                  const cName =
                    issue.cycle?.name ||
                    (issue.cycle_id && cycles ? cycles.find((c) => c.id === issue.cycle_id)?.name : null);
                  if (!cName) return null;
                  return (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-normal flex items-center gap-1">
                      <Repeat className="w-2.5 h-2.5 text-zinc-500" />
                      <span>{cName}</span>
                    </span>
                  );
                })()}
              </div>
              <div className="col-span-5 font-medium text-white truncate pr-4">{issue.title}</div>
              <div className="col-span-2">
                <StateBadge state={issue.state} />
              </div>
              <div className="col-span-1">
                <PriorityBadge priority={issue.priority} showLabel={false} />
              </div>
              <div className="col-span-1 flex items-center gap-1.5">
                {(() => {
                  const resolvedAssignee = issue.assignee || (issue.assignee_id ? users.find((u) => u.id === issue.assignee_id) : null);
                  if (!resolvedAssignee) {
                    return <span className="text-zinc-500 text-[10px]">Unassigned</span>;
                  }
                  const name = resolvedAssignee.name || resolvedAssignee.email || 'Member';
                  const initials = name
                    .split(' ')
                    .filter(Boolean)
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'M';

                  if (resolvedAssignee.avatar_url) {
                    return (
                      <img
                        src={resolvedAssignee.avatar_url}
                        alt={name}
                        className="w-5 h-5 rounded-full object-cover ring-1 ring-zinc-700"
                        title={name}
                      />
                    );
                  }

                  return (
                    <div
                      className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-[9px] font-bold"
                      title={name}
                    >
                      {initials}
                    </div>
                  );
                })()}
              </div>
              <div className="col-span-1 text-right font-mono text-zinc-400">
                {issue.estimate ? `${issue.estimate}p` : '—'}
              </div>
            </div>
          ))}

          {issues.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-500">No matching issues found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
