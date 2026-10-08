'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, CornerDownRight, ChevronDown, ChevronRight, Layers, FolderGit2, Calendar } from 'lucide-react';
import { Issue, WorkflowState, User } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { buildIssueTree, buildSwimlanes, SwimlaneRow } from '@/lib/issueTree';
import { IssueBreadcrumbPath } from '@/components/issues/IssueBreadcrumbPath';

interface KanbanBoardProps {
  states: WorkflowState[];
  issues: Issue[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  groupBy?: 'parent' | 'none';
  onSelectIssue: (issue: Issue) => void;
  onOpenNewIssueWithState: (stateId: string) => void;
  onAddSubtask?: (parentId: string, stateId?: string) => void;
  onMoveIssueState: (issueId: string, newStateId: string, prevRank?: string, nextRank?: string) => void;
  onDeleteIssue?: (issueId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  states,
  issues,
  users = [],
  groupBy = 'none',
  onSelectIssue,
  onOpenNewIssueWithState,
  onAddSubtask,
  onMoveIssueState,
  onDeleteIssue,
  onDragStateChange,
}) => {
  const activeStates = states;

  // Build tree & swimlanes data structure
  const tree = useMemo(() => buildIssueTree(issues), [issues]);
  const swimlanes = useMemo(() => buildSwimlanes(issues, states), [issues, states]);

  // Collapsed state map for swimlanes (default all expanded)
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Record<string, boolean>>({});

  const toggleSwimlane = (id: string) => {
    setCollapsedSwimlanes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // ─── Drag & Drop Helpers ──────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, issueId: string, swimlaneId: string = '__default__') => {
    e.dataTransfer.setData('text/plain', issueId);
    e.dataTransfer.setData('application/json', JSON.stringify({ issueId, swimlaneId }));
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

  // Helper to parse dragged issue payload
  const parseDragData = (e: React.DragEvent): { issueId: string; swimlaneId?: string } => {
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    const issueId = e.dataTransfer.getData('text/plain');
    return { issueId };
  };

  // Flat mode: Drop on Column
  const handleDropOnFlatColumn = (e: React.DragEvent, stateId: string) => {
    e.preventDefault();
    onDragStateChange?.(false);
    const { issueId } = parseDragData(e);
    if (!issueId) return;

    const columnIssues = issues.filter((i) => i.state_id === stateId && i.id !== issueId);
    const lastIssue = columnIssues.length > 0 ? columnIssues[columnIssues.length - 1] : null;
    onMoveIssueState(issueId, stateId, lastIssue?.sort_order, undefined);
  };

  // Flat mode: Drop on Card
  const handleDropOnFlatCard = (e: React.DragEvent, targetIssue: Issue, stateId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStateChange?.(false);
    const { issueId } = parseDragData(e);
    if (!issueId || issueId === targetIssue.id) return;

    const columnIssues = issues.filter((i) => i.state_id === stateId && i.id !== issueId);
    const targetIdx = columnIssues.findIndex((i) => i.id === targetIssue.id);
    const prevIssue = targetIdx > 0 ? columnIssues[targetIdx - 1] : null;
    const nextIssue = columnIssues[targetIdx];

    onMoveIssueState(issueId, stateId, prevIssue?.sort_order, nextIssue?.sort_order);
  };

  // Swimlane mode: Drop on Cell (Restrict cross-swimlane drag)
  const handleDropOnSwimlaneCell = (
    e: React.DragEvent,
    targetSwimlaneId: string,
    stateId: string
  ) => {
    e.preventDefault();
    onDragStateChange?.(false);
    const { issueId, swimlaneId: sourceSwimlaneId } = parseDragData(e);
    if (!issueId) return;

    // Boundary check: Enforce no cross-swimlane drag
    if (sourceSwimlaneId && sourceSwimlaneId !== targetSwimlaneId) {
      return;
    }

    const targetSwimlane = swimlanes.find((s) => s.id === targetSwimlaneId);
    const cellIssues = (targetSwimlane?.columns[stateId] || []).filter((i) => i.id !== issueId);
    const lastIssue = cellIssues.length > 0 ? cellIssues[cellIssues.length - 1] : null;
    onMoveIssueState(issueId, stateId, lastIssue?.sort_order, undefined);
  };

  // Swimlane mode: Drop on Card (Restrict cross-swimlane drag)
  const handleDropOnSwimlaneCard = (
    e: React.DragEvent,
    targetIssue: Issue,
    targetSwimlaneId: string,
    stateId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStateChange?.(false);
    const { issueId, swimlaneId: sourceSwimlaneId } = parseDragData(e);
    if (!issueId || issueId === targetIssue.id) return;

    // Boundary check: Enforce no cross-swimlane drag
    if (sourceSwimlaneId && sourceSwimlaneId !== targetSwimlaneId) {
      return;
    }

    const targetSwimlane = swimlanes.find((s) => s.id === targetSwimlaneId);
    const cellIssues = (targetSwimlane?.columns[stateId] || []).filter((i) => i.id !== issueId);
    const targetIdx = cellIssues.findIndex((i) => i.id === targetIssue.id);
    const prevIssue = targetIdx > 0 ? cellIssues[targetIdx - 1] : null;
    const nextIssue = cellIssues[targetIdx];

    onMoveIssueState(issueId, stateId, prevIssue?.sort_order, nextIssue?.sort_order);
  };

  // ─── Render Assignee Avatar Helper ────────────────────────────────────────
  const renderAssigneeAvatar = (issue: Issue) => {
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

    return (
      <div title={tooltipText} className="shrink-0">
        <UserAvatar
          name={assigneeUser.name}
          email={assigneeUser.email}
          avatarUrl={assigneeUser.avatar_url}
          size="xs"
        />
      </div>
    );
  };

  // ─── Render Issue Card Component ──────────────────────────────────────────
  const renderCard = (
    issue: Issue,
    swimlaneId: string,
    onDropCard: (e: React.DragEvent, issue: Issue, stateId: string) => void
  ) => {
    const ancestors = tree.allNodes.get(issue.id)?.ancestors || [];

    return (
      <div
        key={issue.id}
        draggable
        onDragStart={(e) => handleDragStart(e, issue.id, swimlaneId)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => onDropCard(e, issue, issue.state_id)}
        onClick={() => onSelectIssue(issue)}
        className="p-3 rounded-md bg-surface-elevated/70 hover:bg-surface-elevated border border-border-subtle hover:border-white/[0.12] transition-all duration-150 shadow-xs cursor-grab active:cursor-grabbing group flex flex-col gap-2"
      >
        {/* Card Header: Hierarchy Slug Track & Actions */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex flex-col min-w-0">
            {ancestors.length > 0 && (
              <IssueBreadcrumbPath
                ancestors={ancestors}
                currentIdentifier={issue.identifier}
                currentTitle={issue.title}
                onClickAncestor={onSelectIssue}
                className="mb-1"
              />
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-mono font-medium text-zinc-400 group-hover:text-white transition-colors">
                {issue.identifier}
              </span>
              {issue.parent_id && (
                <span
                  className="text-[9px] font-mono font-medium px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center gap-0.5 shrink-0"
                  title="Subtask"
                >
                  <CornerDownRight className="w-2.5 h-2.5 text-zinc-500" />
                  <span>subtask</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onAddSubtask && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSubtask(issue.id, issue.state_id);
                }}
                className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer flex items-center gap-0.5 border border-zinc-800"
                title={`Create subtask under ${issue.identifier}`}
              >
                <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                <span>Subtask</span>
              </button>
            )}
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
        <p className="text-xs font-medium text-text-primary line-clamp-2 leading-relaxed">
          {issue.title}
        </p>

        {/* Labels */}
        {issue.labels && issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {issue.labels.map((lbl) => (
              <span
                key={lbl.id}
                className="text-[10px] px-1.5 py-0.5 rounded border font-medium flex items-center gap-1"
                style={{
                  backgroundColor: `${lbl.color}15`,
                  borderColor: `${lbl.color}35`,
                  color: lbl.color,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lbl.color }} />
                {lbl.name}
              </span>
            ))}
          </div>
        )}

        {/* Card Footer: Assignee & Date Created */}
        <div className="flex items-center justify-between pt-1 border-t border-border-divider text-[11px] text-text-tertiary">
          <div className="flex items-center gap-1.5">
            {renderAssigneeAvatar(issue)}
            {issue.subtasks && issue.subtasks.length > 0 && (
              <span className="text-[10px] text-text-tertiary font-mono">
                {issue.subtasks.filter((s) => s.state?.category === 'completed').length}/
                {issue.subtasks.length}
              </span>
            )}
          </div>

          {issue.created_at && (
            <span
              className="text-[10px] text-zinc-400 flex items-center gap-1 font-sans"
              title={`Created: ${new Date(issue.created_at).toLocaleString()}`}
            >
              <Calendar className="w-3 h-3 text-zinc-500" />
              <span>
                {new Date(issue.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  ...(new Date(issue.created_at).getFullYear() !== new Date().getFullYear()
                    ? { year: 'numeric' }
                    : {}),
                })}
              </span>
            </span>
          )}
        </div>
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE: Vertical Kanban (Group By None)
  // ──────────────────────────────────────────────────────────────────────────
  if (groupBy === 'none') {
    return (
      <div className="flex-1 overflow-x-auto p-6 flex gap-4 select-none min-h-[calc(100vh-3.5rem)] font-sans">
        {activeStates.map((state) => {
          const stateIssues = issues.filter((i) => i.state_id === state.id);

          return (
            <div
              key={state.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnFlatColumn(e, state.id)}
              className="w-80 shrink-0 flex flex-col bg-panel-dark/95 rounded-lg border border-border-subtle overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-panel-dark">
                <div className="flex items-center gap-2">
                  <StateBadge state={state} />
                  <span className="text-xs font-mono text-text-tertiary">{stateIssues.length}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenNewIssueWithState(state.id)}
                    className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-white/[0.06] transition-colors cursor-pointer"
                    title="Add Issue to State"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* Column Issues List */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-10rem)]">
                {stateIssues.map((issue) =>
                  renderCard(issue, '__default__', (e, target) =>
                    handleDropOnFlatCard(e, target, state.id)
                  )
                )}

                {stateIssues.length === 0 && (
                  <div className="py-6 text-center text-xs text-text-quaternary border border-dashed border-border-subtle rounded-md">
                    No issues
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE: Horizontal Swimlanes (Group By Parent)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-x-auto p-6 select-none min-h-[calc(100vh-3.5rem)] font-sans flex flex-col gap-6">
      {/* ─── Sticky Master Column Header Row ─── */}
      <div className="sticky top-0 z-20 bg-canvas-workspace/90 backdrop-blur-md pb-3 border-b border-border-subtle flex gap-4 min-w-max">
        {activeStates.map((state) => {
          // Total issues across all swimlanes in this state
          const count = issues.filter((i) => i.state_id === state.id).length;

          return (
            <div
              key={state.id}
              className="w-80 shrink-0 px-3 py-2 bg-panel-dark border border-border-subtle rounded-md flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <StateBadge state={state} />
                <span className="text-xs font-mono text-text-tertiary">{count}</span>
              </div>
              <button
                onClick={() => onOpenNewIssueWithState(state.id)}
                className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-white/[0.06] transition-colors cursor-pointer"
                title={`Add Issue in ${state.name}`}
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ─── Swimlane Rows ─── */}
      <div className="flex flex-col gap-5 min-w-max">
        {swimlanes.map((swimlane) => {
          const isCollapsed = collapsedSwimlanes[swimlane.id] ?? false;

          return (
            <div
              key={swimlane.id}
              className="flex flex-col rounded-lg border border-border-subtle bg-panel-dark/50 overflow-hidden shadow-xs"
            >
              {/* ─── Swimlane Row Header ─── */}
              <div className="p-3 bg-panel-dark/90 border-b border-border-subtle flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Collapse Toggle */}
                  <button
                    onClick={() => toggleSwimlane(swimlane.id)}
                    className="p-1 rounded hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    title={isCollapsed ? 'Expand Swimlane' : 'Collapse Swimlane'}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {swimlane.isIndependent ? (
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-zinc-400" />
                      <span className="text-sm font-semibold text-zinc-200">
                        Independent Issues
                      </span>
                      <span className="text-xs font-mono text-zinc-500">
                        ({swimlane.totalCount} issues)
                      </span>
                    </div>
                  ) : (
                    swimlane.parent && (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderGit2 className="w-4 h-4 text-indigo-400 shrink-0" />
                        <button
                          onClick={() => onSelectIssue(swimlane.parent!)}
                          className="text-xs font-mono font-semibold text-zinc-300 hover:text-indigo-400 transition-colors cursor-pointer shrink-0"
                          title="Open Parent Issue"
                        >
                          {swimlane.parent.identifier}
                        </button>
                        <span className="text-zinc-600">·</span>
                        <span
                          onClick={() => onSelectIssue(swimlane.parent!)}
                          className="text-xs font-medium text-zinc-100 truncate max-w-[280px] hover:text-zinc-300 transition-colors cursor-pointer"
                          title={swimlane.parent.title}
                        >
                          {swimlane.parent.title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-1">
                          {swimlane.parent.state && <StateBadge state={swimlane.parent.state} />}
                          <PriorityBadge priority={swimlane.parent.priority} />
                          {renderAssigneeAvatar(swimlane.parent)}
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* Swimlane Stats & Quick Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* Progress Bar */}
                  <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                    <span>
                      {swimlane.completedCount}/{swimlane.totalCount}
                    </span>
                    <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${swimlane.completionPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Add Subtask Button for Parent Swimlane */}
                  {!swimlane.isIndependent && swimlane.parent && onAddSubtask && (
                    <button
                      onClick={() => onAddSubtask(swimlane.parent!.id)}
                      className="px-2 py-1 rounded text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Add Subtask to this Parent"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                      <span>Add subtask</span>
                    </button>
                  )}
                </div>
              </div>

              {/* ─── Swimlane Columns Row (Hidden when collapsed) ─── */}
              {!isCollapsed && (
                <div className="p-3 flex gap-4 bg-zinc-950/40">
                  {activeStates.map((state) => {
                    const cellIssues = swimlane.columns[state.id] || [];

                    return (
                      <div
                        key={state.id}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnSwimlaneCell(e, swimlane.id, state.id)}
                        className={`w-80 shrink-0 min-h-[110px] p-2 rounded-lg border flex flex-col gap-2 transition-colors ${
                          cellIssues.length > 0
                            ? 'bg-zinc-950 border-zinc-800/80'
                            : 'bg-zinc-950/30 border-dashed border-zinc-900 hover:border-zinc-800'
                        }`}
                      >
                        {cellIssues.map((issue) =>
                          renderCard(issue, swimlane.id, (e, target) =>
                            handleDropOnSwimlaneCard(e, target, swimlane.id, state.id)
                          )
                        )}

                        {cellIssues.length === 0 && (
                          <div className="flex-1 flex items-center justify-center text-[11px] text-zinc-600 select-none py-4">
                            Drop subticket here
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {swimlanes.length === 0 && (
          <div className="py-16 text-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
            No issues found. Create a parent issue and break it down into subtickets to view the horizontal kanban.
          </div>
        )}
      </div>
    </div>
  );
};
