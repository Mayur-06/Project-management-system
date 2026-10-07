'use client';

import React from 'react';
import Link from 'next/link';
import { Issue, WorkflowState, User } from '@/types';
import { Plus } from 'lucide-react';

interface IssueSubtasksTreeProps {
  rootIssue?: Issue;
  subtasks: Issue[];
  orgSlug?: string;
  teamKey?: string;
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  onSelectIssue?: (issue: Issue) => void;
  onAddSubtaskToParent?: (parentIssueId: string) => void;
}

interface TreeDisplayNode {
  issue: Issue;
  depth: number;
  isRoot: boolean;
  isLastChild: boolean;
  hasChildren: boolean;
  childrenCount: number;
  completedChildrenCount: number;
  ancestorGuides: boolean[]; // For each ancestor depth 0..(depth-2), whether a guide line continues down
}

export const IssueSubtasksTree: React.FC<IssueSubtasksTreeProps> = ({
  rootIssue,
  subtasks,
  orgSlug = '',
  teamKey = '',
  users = [],
  onSelectIssue,
  onAddSubtaskToParent,
}) => {
  // Step 1: Flatten tree structure recursively
  const nodes: TreeDisplayNode[] = [];

  // If root issue is provided, add it as depth 0
  if (rootIssue) {
    const rootCompleted = subtasks.filter((s) => s.state?.category === 'completed').length;
    nodes.push({
      issue: rootIssue,
      depth: 0,
      isRoot: true,
      isLastChild: true,
      hasChildren: subtasks.length > 0,
      childrenCount: subtasks.length,
      completedChildrenCount: rootCompleted,
      ancestorGuides: [],
    });
  }

  const flattenChildren = (
    items: Issue[],
    depth: number,
    ancestorGuides: boolean[]
  ) => {
    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      const children = (item.subtasks || []) as Issue[];
      const childrenCount = children.length;
      const completedChildrenCount = children.filter((c) => c.state?.category === 'completed').length;

      nodes.push({
        issue: item,
        depth,
        isRoot: false,
        isLastChild: isLast,
        hasChildren: childrenCount > 0,
        childrenCount,
        completedChildrenCount,
        ancestorGuides: [...ancestorGuides],
      });

      if (childrenCount > 0) {
        // Next level receives whether this node has subsequent siblings
        const nextGuides = [...ancestorGuides, !isLast];
        flattenChildren(children, depth + 1, nextGuides);
      }
    });
  };

  const initialDepth = rootIssue ? 1 : 0;
  flattenChildren(subtasks, initialDepth, []);

  // Render State Icon (Linear style dotted circle for unstarted, half for started, check for completed)
  const renderStateIcon = (issue: Issue) => {
    const category = issue.state?.category || 'unstarted';

    switch (category) {
      case 'completed':
        return (
          <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="7" />
            <path
              d="M4.5 8l2.5 2.5 4.5-5"
              stroke="#000"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        );
      case 'started':
        return (
          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M 8 2 A 6 6 0 0 1 8 14 Z" fill="currentColor" />
          </svg>
        );
      case 'canceled':
        return (
          <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'backlog':
        return (
          <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.5 2" />
          </svg>
        );
      case 'unstarted':
      default:
        return (
          <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 16 16" fill="none">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="2.5 1.5"
            />
          </svg>
        );
    }
  };

  // Render Priority Icon (Linear style `---` for none)
  const renderPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="text-[10px] font-mono font-bold text-red-400 tracking-tighter" title="Urgent">
            ▲▲
          </span>
        );
      case 'high':
        return (
          <span className="text-[10px] font-mono font-bold text-orange-400 tracking-tighter" title="High">
            ▲
          </span>
        );
      case 'medium':
        return (
          <span className="text-[10px] font-mono font-bold text-yellow-400 tracking-tighter" title="Medium">
            ■
          </span>
        );
      case 'low':
        return (
          <span className="text-[10px] font-mono font-bold text-blue-400 tracking-tighter" title="Low">
            ▼
          </span>
        );
      case 'none':
      default:
        return (
          <span className="text-zinc-500 font-mono text-xs font-semibold tracking-[-1px] select-none shrink-0" title="No Priority">
            ---
          </span>
        );
    }
  };

  // Render Assignee Avatar
  const renderAssignee = (issue: Issue) => {
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
    if (!assigneeUser) return null;

    const name = assigneeUser.name || assigneeUser.email || 'Member';
    const initials =
      name
        .split(' ')
        .filter(Boolean)
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'M';

    if (assigneeUser.avatar_url) {
      return (
        <img
          src={assigneeUser.avatar_url}
          alt={name}
          className="w-4.5 h-4.5 rounded-full object-cover ring-1 ring-zinc-700 shrink-0"
          title={`Assigned to ${name}`}
        />
      );
    }

    return (
      <div
        className="w-4.5 h-4.5 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-500 text-white flex items-center justify-center text-[9px] font-bold shrink-0"
        title={`Assigned to ${name}`}
      >
        {initials}
      </div>
    );
  };

  // Format Date (e.g. Oct 7)
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const INDENT_STEP = 24; // px per depth level
  const BASE_X = 5; // px anchor under first dash

  return (
    <div className="flex flex-col font-sans select-none w-full text-xs">
      {nodes.map((node) => {
        const {
          issue,
          depth,
          isRoot,
          isLastChild,
          hasChildren,
          childrenCount,
          completedChildrenCount,
          ancestorGuides,
        } = node;

        const effectiveDepth = depth;
        const contentLeftOffset = effectiveDepth * INDENT_STEP;
        const currentAnchorX = BASE_X + effectiveDepth * INDENT_STEP;
        const parentAnchorX = BASE_X + (effectiveDepth - 1) * INDENT_STEP;

        return (
          <div
            key={issue.id}
            onClick={() => {
              if (onSelectIssue) onSelectIssue(issue);
            }}
            className="group relative flex items-center justify-between py-2 px-2 hover:bg-zinc-900/60 rounded-md transition-colors cursor-pointer min-h-[36px]"
          >
            {/* ─── TREE CONNECTOR LINES LAYER ─── */}
            <div className="absolute inset-0 pointer-events-none">
              {/* If root or current node has children: drop a vertical line to next rows */}
              {hasChildren && (
                <div
                  className="absolute top-1/2 bottom-0 w-px bg-zinc-700/80"
                  style={{ left: `${currentAnchorX + 8}px` }}
                />
              )}

              {/* For depth > 0: draw ancestor vertical guide lines */}
              {effectiveDepth > 0 &&
                ancestorGuides.map((hasGuide, guideIdx) => {
                  if (!hasGuide) return null;
                  const guideX = BASE_X + guideIdx * INDENT_STEP + 8;
                  return (
                    <div
                      key={guideIdx}
                      className="absolute top-0 bottom-0 w-px bg-zinc-700/80"
                      style={{ left: `${guideX}px` }}
                    />
                  );
                })}

              {/* Immediate branch elbow from parent down and right into this node */}
              {effectiveDepth > 0 && (
                <>
                  {isLastChild ? (
                    // Last child: line from top to 50%, curved 90° right to content
                    <div
                      className="absolute top-0 border-b border-l border-zinc-700/80 rounded-bl-[4px]"
                      style={{
                        left: `${parentAnchorX + 8}px`,
                        height: '50%',
                        width: `${INDENT_STEP}px`,
                      }}
                    />
                  ) : (
                    // Middle child: line passes straight through top-to-bottom + horizontal branch at 50%
                    <>
                      <div
                        className="absolute top-0 bottom-0 w-px bg-zinc-700/80"
                        style={{ left: `${parentAnchorX + 8}px` }}
                      />
                      <div
                        className="absolute top-1/2 h-px bg-zinc-700/80"
                        style={{
                          left: `${parentAnchorX + 8}px`,
                          width: `${INDENT_STEP}px`,
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </div>

            {/* ─── ROW CONTENT: Priority, Identifier, State, Title, Progress ─── */}
            <div
              className="flex items-center min-w-0 z-10"
              style={{ paddingLeft: `${contentLeftOffset}px` }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {renderPriorityIcon(issue.priority)}

                <span className="font-mono text-zinc-400 text-xs font-normal shrink-0">
                  {issue.identifier}
                </span>

                {renderStateIcon(issue)}

                <span className="text-white font-medium text-xs truncate max-w-[260px] sm:max-w-[420px]">
                  {issue.title}
                </span>

                {/* Subtask Progress Badge: [ 0/3 ] */}
                {childrenCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-400 font-mono shrink-0 select-none ml-1">
                    <svg className="w-2.5 h-2.5 text-zinc-500 shrink-0" viewBox="0 0 16 16" fill="none">
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="3 1.5"
                        opacity="0.6"
                      />
                      {completedChildrenCount > 0 && (
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          stroke="#818cf8"
                          strokeWidth="2"
                          strokeDasharray={`${(completedChildrenCount / childrenCount) * 37.7} 37.7`}
                          strokeDashoffset="9.4"
                        />
                      )}
                    </svg>
                    <span>
                      {completedChildrenCount}/{childrenCount}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ─── RIGHT RAIL: Quick Add, Assignee Avatar, Date ─── */}
            <div className="flex items-center gap-3 shrink-0 ml-auto pl-3 z-10">
              {onAddSubtaskToParent && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSubtaskToParent(issue.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                  title={`Add subtask to ${issue.identifier}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              {renderAssignee(issue)}
              <span className="text-zinc-500 text-xs font-normal shrink-0 select-none">
                {formatDate(issue.created_at)}
              </span>
            </div>
          </div>
        );
      })}

      {nodes.length === 0 && (
        <div className="py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-900 rounded-lg">
          No subtasks yet.
        </div>
      )}
    </div>
  );
};
