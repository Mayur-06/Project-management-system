'use client';

import React from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import { Issue, WorkflowState } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

interface KanbanBoardProps {
  states: WorkflowState[];
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
  onOpenNewIssueWithState: (stateId: string) => void;
  onMoveIssueState: (issueId: string, newStateId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  states,
  issues,
  onSelectIssue,
  onOpenNewIssueWithState,
  onMoveIssueState,
}) => {
  // Exclude canceled/triage from main active board columns if desired or show standard linear workflow columns
  const activeStates = states.filter((s) => s.category !== 'triage');

  return (
    <div className="flex-1 overflow-x-auto p-6 flex gap-4 select-none min-h-[calc(100vh-3.5rem)]">
      {activeStates.map((state) => {
        const stateIssues = issues.filter((i) => i.state_id === state.id);

        return (
          <div
            key={state.id}
            className="w-80 shrink-0 flex flex-col bg-[#0b0c0e]/60 rounded-xl border border-[#1a1c22] overflow-hidden"
          >
            {/* Column Header */}
            <div className="p-3 border-b border-[#181a20] flex items-center justify-between bg-[#0e1013]">
              <div className="flex items-center gap-2">
                <StateBadge state={state} />
                <span className="text-xs font-mono text-zinc-500">{stateIssues.length}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onOpenNewIssueWithState(state.id)}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-[#1c1f26] transition-colors cursor-pointer"
                  title="Add Issue to State"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Column Issues List */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-10rem)]">
              {stateIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => onSelectIssue(issue)}
                  className="p-3 rounded-lg bg-[#121418] hover:bg-[#16191f] border border-[#1f222a] hover:border-[#2e333e] transition-all duration-150 shadow-xs hover:shadow-md cursor-pointer group flex flex-col gap-2.5 active:scale-[0.99]"
                >
                  {/* Card Header: Identifier & Priority */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-medium text-zinc-400 group-hover:text-indigo-400 transition-colors">
                      {issue.identifier}
                    </span>
                    <PriorityBadge priority={issue.priority} />
                  </div>

                  {/* Title */}
                  <p className="text-xs font-medium text-zinc-200 line-clamp-2 leading-relaxed">
                    {issue.title}
                  </p>

                  {/* Labels */}
                  {issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {issue.labels.map((lbl) => (
                        <span
                          key={lbl.id}
                          style={{ borderColor: `${lbl.color}40`, color: lbl.color, backgroundColor: `${lbl.color}15` }}
                          className="text-[10px] px-1.5 py-0.2 rounded border font-medium"
                        >
                          {lbl.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Footer: Assignee & Estimate */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#1a1c22]/60 text-[11px] text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      {issue.assignee ? (
                        <img
                          src={issue.assignee.avatar_url}
                          alt={issue.assignee.name}
                          className="w-4 h-4 rounded-full object-cover"
                          title={`Assigned to ${issue.assignee.name}`}
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-600">Unassigned</span>
                      )}
                      {issue.subtasks && issue.subtasks.length > 0 && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {issue.subtasks.filter((s) => s.state?.category === 'completed').length}/{issue.subtasks.length}
                        </span>
                      )}
                    </div>

                    {issue.estimate && (
                      <span className="text-[10px] font-mono bg-[#181a20] px-1.5 py-0.2 rounded text-zinc-400 border border-[#242730]">
                        {issue.estimate}p
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {stateIssues.length === 0 && (
                <div className="py-6 text-center text-xs text-zinc-600 border border-dashed border-[#1a1c22] rounded-lg">
                  No issues
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
