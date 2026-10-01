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
  // Exclude triage from main active board columns
  const activeStates = states.filter((s) => s.category !== 'triage');

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData('text/plain', issueId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stateId: string) => {
    e.preventDefault();
    const issueId = e.dataTransfer.getData('text/plain');
    if (issueId) {
      onMoveIssueState(issueId, stateId);
    }
  };

  return (
    <div className="flex-1 overflow-x-auto p-6 flex gap-4 select-none min-h-[calc(100vh-3.5rem)] font-sans">
      {activeStates.map((state) => {
        const stateIssues = issues.filter((i) => i.state_id === state.id);

        return (
          <div
            key={state.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, state.id)}
            className="w-80 shrink-0 flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden"
          >
            {/* Column Header */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-black">
              <div className="flex items-center gap-2">
                <StateBadge state={state} />
                <span className="text-xs font-mono text-zinc-400">{stateIssues.length}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onOpenNewIssueWithState(state.id)}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                  title="Add Issue to State"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Column Issues List */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-10rem)]">
              {stateIssues.map((issue) => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, issue.id)}
                  onClick={() => onSelectIssue(issue)}
                  className="p-3 rounded-lg bg-black hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all duration-150 shadow-xs cursor-grab active:cursor-grabbing group flex flex-col gap-2.5"
                >
                  {/* Card Header: Identifier & Priority */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-medium text-zinc-400 group-hover:text-white transition-colors">
                      {issue.identifier}
                    </span>
                    <PriorityBadge priority={issue.priority} />
                  </div>

                  {/* Title */}
                  <p className="text-xs font-medium text-zinc-100 line-clamp-2 leading-relaxed">
                    {issue.title}
                  </p>

                  {/* Labels */}
                  {issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {issue.labels.map((lbl) => (
                        <span
                          key={lbl.id}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 font-medium"
                        >
                          {lbl.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Footer: Assignee & Estimate */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      {issue.assignee ? (
                        <img
                          src={issue.assignee.avatar_url}
                          alt={issue.assignee.name}
                          className="w-4 h-4 rounded-full object-cover ring-1 ring-zinc-700"
                          title={`Assigned to ${issue.assignee.name}`}
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-500">Unassigned</span>
                      )}
                      {issue.subtasks && issue.subtasks.length > 0 && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {issue.subtasks.filter((s) => s.state?.category === 'completed').length}/{issue.subtasks.length}
                        </span>
                      )}
                    </div>

                    {issue.estimate && (
                      <span className="text-[10px] font-mono bg-zinc-900 px-1.5 py-0.5 rounded text-white border border-zinc-800">
                        {issue.estimate}p
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {stateIssues.length === 0 && (
                <div className="py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
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
