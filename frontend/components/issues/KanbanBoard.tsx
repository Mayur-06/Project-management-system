'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, CornerDownRight, ChevronDown, ChevronRight, Layers, FolderGit2, Calendar } from 'lucide-react';
import { Issue, WorkflowState, User, Label } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { SignalPriorityIcon } from '@/components/ui/SignalPriorityIcon';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { StateBadge } from '@/components/ui/StateBadge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { buildIssueTree, buildSwimlanes, SwimlaneRow } from '@/lib/issueTree';
import { HorizontalTreeBoard } from '@/components/issues/HorizontalTreeBoard';
import { Button } from '@/components/ui/button';

interface KanbanBoardProps {
  states: WorkflowState[];
  issues: Issue[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  availableLabels?: Label[];
  groupBy?: 'parent' | 'none';
  onSelectIssue: (issue: Issue) => void;
  onOpenNewIssueWithState: (stateId: string) => void;
  onAddSubtask?: (parentId: string, stateId?: string) => void;
  onMoveIssueState: (issueId: string, newStateId: string, prevRank?: string, nextRank?: string) => void;
  onUpdateIssue?: (issueId: string, updates: Partial<Issue> & { label_ids?: string[]; expected_version?: number }) => Promise<void>;
  onDeleteIssue?: (issueId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

function formatRelativeMonthDay(dateString?: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  states,
  issues,
  users = [],
  availableLabels = [],
  groupBy = 'none',
  onSelectIssue,
  onOpenNewIssueWithState,
  onAddSubtask,
  onMoveIssueState,
  onUpdateIssue,
  onDeleteIssue,
  onDragStateChange,
}) => {
  const activeStates = states;

  // Build tree & swimlanes data structure
  const tree = useMemo(() => buildIssueTree(issues), [issues]);

  // Track manually toggled columns for vertical kanban
  const [manuallyRevealedStateIds, setManuallyRevealedStateIds] = useState<Record<string, boolean>>({});
  const [manuallyHiddenStateIds, setManuallyHiddenStateIds] = useState<Record<string, boolean>>({});
  const [isHiddenColumnsExpanded, setIsHiddenColumnsExpanded] = useState(true);

  // Drag and drop state
  const handleDragStart = (e: React.DragEvent, issueId: string, swimlaneId?: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ issueId, swimlaneId }));
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

  const parseDragData = (e: React.DragEvent): { issueId: string; swimlaneId?: string } => {
    try {
      const raw = e.dataTransfer.getData('text/plain');
      return JSON.parse(raw);
    } catch {
      return { issueId: '' };
    }
  };

  // Flat mode: Drop on Column
  const handleDropOnFlatColumn = (e: React.DragEvent, targetStateId: string) => {
    e.preventDefault();
    onDragStateChange?.(false);
    const { issueId } = parseDragData(e);
    if (!issueId) return;

    const columnIssues = issues.filter((i) => i.state_id === targetStateId && i.id !== issueId);
    const lastIssue = columnIssues.length > 0 ? columnIssues[columnIssues.length - 1] : null;
    onMoveIssueState(issueId, targetStateId, lastIssue?.sort_order, undefined);
  };

  // Flat mode: Drop on Card
  const handleDropOnFlatCard = (e: React.DragEvent, targetIssue: Issue, targetStateId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStateChange?.(false);
    const { issueId } = parseDragData(e);
    if (!issueId || issueId === targetIssue.id) return;

    const columnIssues = issues.filter((i) => i.state_id === targetStateId && i.id !== issueId);
    const targetIdx = columnIssues.findIndex((i) => i.id === targetIssue.id);
    const prevIssue = targetIdx > 0 ? columnIssues[targetIdx - 1] : null;
    const nextIssue = columnIssues[targetIdx];

    onMoveIssueState(issueId, targetStateId, prevIssue?.sort_order, nextIssue?.sort_order);
  };

  // Render Assignee Avatar
  const renderAssigneeAvatar = (issue: Issue) => {
    if (!issue.assignee && !issue.assignee_id) return null;

    const assigneeUser =
      issue.assignee ||
      users.find((u: any) => (u.user?.id || u.id) === issue.assignee_id);

    if (!assigneeUser) return null;

    return (
      <div className="shrink-0" title={`Assigned to ${assigneeUser.name || assigneeUser.email}`}>
        <UserAvatar
          name={assigneeUser.name}
          email={assigneeUser.email}
          avatarUrl={assigneeUser.avatar_url}
          size="xs"
        />
      </div>
    );
  };

  // ─── Render Issue Card Component Matching Image 1 ─────────────────────────
  const renderCard = (
    issue: Issue,
    onDropCard: (e: React.DragEvent, issue: Issue, stateId: string) => void
  ) => {
    const ancestors = tree.allNodes.get(issue.id)?.ancestors || [];
    const resolvedState = issue.state || states.find((s) => s.id === issue.state_id);

    return (
      <div
        key={issue.id}
        draggable
        onDragStart={(e) => handleDragStart(e, issue.id)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => onDropCard(e, issue, issue.state_id)}
        onClick={() => onSelectIssue(issue)}
        className="p-3 rounded-lg bg-[#141517] hover:bg-[#18191c] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-150 shadow-sm cursor-grab active:cursor-grabbing group flex flex-col gap-2 select-none"
      >
        {/* Card Header: Hierarchy Breadcrumb & Assignee Avatar */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center min-w-0 text-[11px] font-mono text-zinc-400 group-hover:text-zinc-300 transition-colors truncate">
            {ancestors.length > 0 ? (
              <span className="truncate">
                {issue.identifier} &gt; {ancestors.map((a: Issue) => a.title).join(' > ')}
              </span>
            ) : (
              <span>{issue.identifier}</span>
            )}
          </div>
          {renderAssigneeAvatar(issue)}
        </div>

        {/* Title with Status Glyph */}
        <div className="flex items-start gap-2 min-w-0">
          <div className="mt-0.5 shrink-0">
            <StatusIcon state={resolvedState} size="xs" />
          </div>
          <p className="text-[13px] font-medium text-zinc-200 group-hover:text-white line-clamp-2 leading-snug">
            {issue.title}
          </p>
        </div>

        {/* Sub-properties: Priority Signal, Labels, Subtask progress fraction */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <SignalPriorityIcon priority={issue.priority} size="xs" />

          {issue.labels?.map((lbl) => (
            <span
              key={lbl.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-zinc-300 border border-white/[0.04]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: lbl.color || '#a1a1aa' }}
              />
              <span>{lbl.name}</span>
            </span>
          ))}

          {issue.subtasks && issue.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full border border-zinc-500" />
              <span>
                {issue.subtasks.filter((s) => s.state?.category === 'completed').length}/{issue.subtasks.length}
              </span>
            </span>
          )}
        </div>

        {/* Footer: Date Created */}
        {issue.created_at && (
          <div className="text-[10px] font-sans text-zinc-500 pt-1 border-t border-white/[0.04]">
            Created {formatRelativeMonthDay(issue.created_at)}
          </div>
        )}
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE: Vertical Kanban (Group By None) Matching Image 1
  // ──────────────────────────────────────────────────────────────────────────
  if (groupBy === 'none') {
    // Separate visible columns vs auto-collapsed hidden columns (0 issues)
    const visibleStates: WorkflowState[] = [];
    const hiddenStates: WorkflowState[] = [];

    activeStates.forEach((state) => {
      const count = issues.filter((i) => i.state_id === state.id).length;
      const isManuallyHidden = manuallyHiddenStateIds[state.id];
      const isManuallyRevealed = manuallyRevealedStateIds[state.id];

      if (isManuallyHidden) {
        hiddenStates.push(state);
      } else if (isManuallyRevealed) {
        visibleStates.push(state);
      } else if (count === 0) {
        // Auto-collapse empty columns into hidden rail per Image 1 & user decision
        hiddenStates.push(state);
      } else {
        visibleStates.push(state);
      }
    });

    const revealColumn = (stateId: string) => {
      setManuallyRevealedStateIds((prev) => ({ ...prev, [stateId]: true }));
      setManuallyHiddenStateIds((prev) => {
        const next = { ...prev };
        delete next[stateId];
        return next;
      });
    };

    const hideColumn = (stateId: string) => {
      setManuallyHiddenStateIds((prev) => ({ ...prev, [stateId]: true }));
      setManuallyRevealedStateIds((prev) => {
        const next = { ...prev };
        delete next[stateId];
        return next;
      });
    };

    return (
      <div className="flex-1 overflow-x-auto p-6 flex gap-6 select-none min-h-[calc(100vh-3.5rem)] font-sans">
        {/* Active Columns */}
        {visibleStates.map((state) => {
          const stateIssues = issues.filter((i) => i.state_id === state.id);

          return (
            <div
              key={state.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnFlatColumn(e, state.id)}
              className="w-80 shrink-0 flex flex-col bg-[#0f1011] rounded-xl border border-white/[0.06] overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-white/[0.06] flex items-center justify-between bg-[#121315]">
                <div className="flex items-center gap-2">
                  <StatusIcon state={state} size="sm" />
                  <span className="text-xs font-semibold text-zinc-200">{state.name}</span>
                  <span className="text-xs font-mono text-zinc-500">{stateIssues.length}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenNewIssueWithState(state.id)}
                    className="h-6 w-6 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                    title="Add Issue to State"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => hideColumn(state.id)}
                    className="h-6 w-6 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors text-[10px]"
                    title="Hide column"
                  >
                    ···
                  </Button>
                </div>
              </div>

              {/* Column Issues List */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-10rem)]">
                {stateIssues.map((issue) =>
                  renderCard(issue, (e, target) => handleDropOnFlatCard(e, target, state.id))
                )}

                {stateIssues.length === 0 && (
                  <div className="py-8 text-center text-xs text-zinc-600 border border-dashed border-white/[0.04] rounded-lg">
                    No issues
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Collapsible Hidden Columns Rail Matching Image 1 */}
        {hiddenStates.length > 0 && (
          <div className="w-72 shrink-0 flex flex-col space-y-2">
            <button
              type="button"
              onClick={() => setIsHiddenColumnsExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer px-1 py-1"
            >
              {isHiddenColumnsExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span>Hidden columns</span>
            </button>

            {isHiddenColumnsExpanded && (
              <div className="space-y-1.5">
                {hiddenStates.map((state) => {
                  const count = issues.filter((i) => i.state_id === state.id).length;
                  return (
                    <button
                      key={state.id}
                      type="button"
                      onClick={() => revealColumn(state.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#121315] hover:bg-[#16171a] border border-white/[0.05] hover:border-white/[0.1] text-xs transition-colors cursor-pointer text-left group"
                      title="Click to reveal column"
                    >
                      <div className="flex items-center gap-2">
                        <StatusIcon state={state} size="sm" />
                        <span className="text-zinc-300 group-hover:text-white font-medium">
                          {state.name}
                        </span>
                      </div>
                      <span className="font-mono text-zinc-500 text-[11px]">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE: Horizontal Swimlanes / Tree View (Group By Parent) - Matches Image 1
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <HorizontalTreeBoard
      issues={issues}
      states={states}
      users={users}
      availableLabels={availableLabels}
      onSelectIssue={onSelectIssue}
      onUpdateIssue={onUpdateIssue}
      onDeleteIssue={onDeleteIssue}
    />
  );
};
