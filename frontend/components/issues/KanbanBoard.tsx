'use client';

import React, { useMemo } from 'react';
import { Plus, Trash2, CornerDownRight, Repeat } from 'lucide-react';
import { Issue, WorkflowState, User } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

interface KanbanBoardProps {
  states: WorkflowState[];
  issues: Issue[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  onSelectIssue: (issue: Issue) => void;
  onOpenNewIssueWithState: (stateId: string) => void;
  onMoveIssueState: (issueId: string, newStateId: string, prevRank?: string, nextRank?: string) => void;
  onDeleteIssue?: (issueId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  states,
  issues,
  users = [],
  onSelectIssue,
  onOpenNewIssueWithState,
  onMoveIssueState,
  onDeleteIssue,
  onDragStateChange,
}) => {
  const activeStates = states;

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData('text/plain', issueId);
    e.dataTransfer.effectAllowed = 'move';
    onDragStateChange?.(true);
  };

  const handleDragEnd = () => {
    onDragStateChange?.(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnColumn = (e: React.DragEvent, stateId: string) => {
    e.preventDefault();
    onDragStateChange?.(false);
    const issueId = e.dataTransfer.getData('text/plain');
    if (!issueId) return;

    const columnIssues = issues.filter((i) => i.state_id === stateId && i.id !== issueId);
    const lastIssue = columnIssues.length > 0 ? columnIssues[columnIssues.length - 1] : null;
    onMoveIssueState(issueId, stateId, lastIssue?.sort_order, undefined);
  };

  const handleDropOnCard = (e: React.DragEvent, targetIssue: Issue, stateId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStateChange?.(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetIssue.id) return;

    const columnIssues = issues.filter((i) => i.state_id === stateId && i.id !== draggedId);
    const targetIdx = columnIssues.findIndex((i) => i.id === targetIssue.id);
    const prevIssue = targetIdx > 0 ? columnIssues[targetIdx - 1] : null;
    const nextIssue = columnIssues[targetIdx];

    onMoveIssueState(draggedId, stateId, prevIssue?.sort_order, nextIssue?.sort_order);
  };

  return (
    <div className="flex-1 overflow-x-auto p-6 flex gap-4 select-none min-h-[calc(100vh-3.5rem)] font-sans">
      {activeStates.map((state) => {
        const stateIssues = issues.filter((i) => i.state_id === state.id);

        return (
          <div
            key={state.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnColumn(e, state.id)}
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
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnCard(e, issue, state.id)}
                  onClick={() => onSelectIssue(issue)}
                  className="p-3 rounded-lg bg-black hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all duration-150 shadow-xs cursor-grab active:cursor-grabbing group flex flex-col gap-2.5"
                >
                  {/* Card Header: Identifier, Subtask tag & Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-mono font-medium text-zinc-400 group-hover:text-white transition-colors">
                        {issue.identifier}
                      </span>
                      {issue.parent_id && (
                        <span
                          className="text-[9px] font-mono font-medium px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center gap-0.5"
                          title="Subtask"
                        >
                          <CornerDownRight className="w-2.5 h-2.5 text-zinc-500" />
                          <span>subtask</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onDeleteIssue && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete ${issue.identifier}: "${issue.title}" permanently?`)) {
                              onDeleteIssue(issue.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all cursor-pointer"
                          title="Delete Issue"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <PriorityBadge priority={issue.priority} />
                    </div>
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
                          return <span className="text-[10px] text-zinc-500">Unassigned</span>;
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
                        const tooltipText = `Assigned to: ${name}${assignedByName ? ` (by ${assignedByName})` : ''}`;

                        if (assigneeUser.avatar_url) {
                          return (
                            <img
                              src={assigneeUser.avatar_url}
                              alt={name}
                              className="w-4 h-4 rounded-full object-cover ring-1 ring-zinc-700"
                              title={tooltipText}
                            />
                          );
                        }

                        return (
                          <div
                            className="w-4 h-4 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-[8px] font-bold"
                            title={tooltipText}
                          >
                            {initials}
                          </div>
                        );
                      })()}
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
