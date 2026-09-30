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
    <div className="flex-1 p-6 select-none overflow-x-auto">
      <div className="w-full bg-[#0c0d10] border border-[#1e2026] rounded-xl overflow-hidden shadow-md">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-[#101216] border-b border-[#1c1f26] text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <div className="col-span-2">Identifier</div>
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-1">Assignee</div>
          <div className="col-span-1 text-right">Estimate</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[#181a20]">
          {issues.map((issue) => (
            <div
              key={issue.id}
              onClick={() => onSelectIssue(issue)}
              className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-[#14161c] transition-colors cursor-pointer text-xs text-zinc-300"
            >
              <div className="col-span-2 font-mono font-medium text-zinc-400 flex items-center gap-2">
                <span className="text-indigo-400">{issue.identifier}</span>
              </div>
              <div className="col-span-5 font-medium text-zinc-100 truncate pr-4">{issue.title}</div>
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
                    className="w-5 h-5 rounded-full object-cover"
                    title={issue.assignee.name}
                  />
                ) : (
                  <span className="text-zinc-600 text-[10px]">Unassigned</span>
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
