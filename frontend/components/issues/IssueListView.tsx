'use client';

import React from 'react';
import { Issue } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

interface IssueListViewProps {
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
}

export const IssueListView: React.FC<IssueListViewProps> = ({ issues, onSelectIssue }) => {
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
              <div className="col-span-2 font-mono font-medium text-white flex items-center gap-2">
                <span>{issue.identifier}</span>
              </div>
              <div className="col-span-5 font-medium text-white truncate pr-4">{issue.title}</div>
              <div className="col-span-2">
                <StateBadge state={issue.state} />
              </div>
              <div className="col-span-1">
                <PriorityBadge priority={issue.priority} showLabel={false} />
              </div>
              <div className="col-span-1 flex items-center gap-1.5">
                {issue.assignee ? (
                  <img
                    src={issue.assignee.avatar_url}
                    alt={issue.assignee.name}
                    className="w-5 h-5 rounded-full object-cover ring-1 ring-zinc-700"
                    title={issue.assignee.name}
                  />
                ) : (
                  <span className="text-zinc-500 text-[10px]">Unassigned</span>
                )}
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
