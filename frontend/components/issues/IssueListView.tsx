'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Calendar,
  Check,
  Plus,
  Tag,
  User as UserIcon,
  CircleDot,
  Signal,
  Flame,
  AlertTriangle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { Issue, WorkflowState, User, Label, IssuePriority } from '@/types';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';
import { buildIssueTree } from '@/lib/issueTree';

interface IssueListViewProps {
  issues: Issue[];
  states?: WorkflowState[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  availableLabels?: Label[];
  onSelectIssue: (issue: Issue) => void;
  onUpdateIssue?: (issueId: string, updates: Partial<Issue> & { label_ids?: string[]; expected_version?: number }) => Promise<void>;
}

interface FlattenedListRow {
  issue: Issue;
  depth: number;
  isLastChild: boolean;
  hasChildren: boolean;
  childrenCount: number;
  completedChildrenCount: number;
  ancestorGuides: boolean[];
}

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; icon: any; color: string }[] = [
  { value: 'urgent', label: 'Urgent', icon: Flame, color: 'text-red-500' },
  { value: 'high', label: 'High', icon: ArrowUp, color: 'text-orange-500' },
  { value: 'medium', label: 'Medium', icon: ArrowRight, color: 'text-yellow-500' },
  { value: 'low', label: 'Low', icon: ArrowDown, color: 'text-blue-500' },
  { value: 'none', label: 'No Priority', icon: Minus, color: 'text-zinc-500' },
];

export const IssueListView: React.FC<IssueListViewProps> = ({
  issues,
  states = [],
  users = [],
  availableLabels = [],
  onSelectIssue,
  onUpdateIssue,
}) => {
  // Active dropdown state: { issueId, type }
  const [activeDropdown, setActiveDropdown] = useState<{
    issueId: string;
    type: 'status' | 'priority' | 'assignee' | 'labels';
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    if (activeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeDropdown]);

  // Flatten issues into tree order so subtasks appear under parent
  const flattenedIssues = useMemo(() => {
    const tree = buildIssueTree(issues);
    const result: FlattenedListRow[] = [];

    const traverse = (items: Issue[], depth: number, guides: boolean[]) => {
      items.forEach((item, idx) => {
        const isLast = idx === items.length - 1;
        const children = tree.childrenMap.get(item.id) || [];
        const childrenCount = children.length;
        const completedChildrenCount = children.filter(
          (c) => c.state?.category === 'completed'
        ).length;

        result.push({
          issue: item,
          depth,
          isLastChild: isLast,
          hasChildren: childrenCount > 0,
          childrenCount,
          completedChildrenCount,
          ancestorGuides: [...guides],
        });

        if (childrenCount > 0) {
          traverse(children, depth + 1, [...guides, !isLast]);
        }
      });
    };

    traverse(tree.rootIssues, 0, []);
    return result;
  }, [issues]);

  const normalizedUsers = useMemo(() => {
    return users.map((u: any) => u.user || u).filter(Boolean);
  }, [users]);

  return (
    <div className="flex-1 p-6 select-none overflow-x-auto font-sans pb-40" ref={dropdownRef}>
      <div className="w-full min-w-[900px] bg-black border border-zinc-800 rounded-xl overflow-visible shadow-xs">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 items-center rounded-t-xl">
          <div className="col-span-2">Identifier</div>
          <div className="col-span-3">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-2">Assigned to</div>
          <div className="col-span-1">Labels</div>
          <div className="col-span-1 text-right">Created</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-zinc-800/80">
          {flattenedIssues.map((row, idx) => {
            const { issue, depth, isLastChild, childrenCount, completedChildrenCount, ancestorGuides } = row;
            const resolvedState = issue.state || states.find((s) => s.id === issue.state_id);

            const isStatusOpen = activeDropdown?.issueId === issue.id && activeDropdown.type === 'status';
            const isPriorityOpen = activeDropdown?.issueId === issue.id && activeDropdown.type === 'priority';
            const isAssigneeOpen = activeDropdown?.issueId === issue.id && activeDropdown.type === 'assignee';
            const isLabelsOpen = activeDropdown?.issueId === issue.id && activeDropdown.type === 'labels';
            const isAnyDropdownOpen = isStatusOpen || isPriorityOpen || isAssigneeOpen || isLabelsOpen;

            // Flip dropdown upward if row is near bottom of table and there is space above
            const isNearBottom = idx >= Math.max(2, flattenedIssues.length - 3);

            const resolvedAssignee =
              issue.assignee ||
              (issue.assignee_id
                ? (normalizedUsers.find((u: any) => u.id === issue.assignee_id) as any)
                : null);

            return (
              <div
                key={issue.id}
                onClick={() => onSelectIssue(issue)}
                className={`grid grid-cols-12 gap-3 px-4 py-2.5 items-center hover:bg-zinc-900/60 transition-colors cursor-pointer text-xs text-zinc-300 relative group ${
                  isAnyDropdownOpen ? 'z-40' : 'z-0'
                } ${idx === flattenedIssues.length - 1 ? 'rounded-b-xl' : ''}`}
              >
                {/* Column 1: Tree connectors + Identifier */}
                <div className="col-span-2 font-mono font-medium text-white flex items-center min-w-0">
                  {depth > 0 && (
                    <div className="flex items-center shrink-0 mr-1.5 select-none text-zinc-600 font-mono text-xs">
                      {ancestorGuides.map((hasGuide, gIdx) => (
                        <span key={gIdx} className="w-3.5 inline-block text-center">
                          {hasGuide ? '│' : ' '}
                        </span>
                      ))}
                      <span className="w-3.5 inline-block text-center text-zinc-500">
                        {isLastChild ? '└──' : '├──'}
                      </span>
                    </div>
                  )}

                  <span className="text-zinc-400 font-normal hover:text-white transition-colors">{issue.identifier}</span>
                </div>

                {/* Column 2: Title + Subtask count badge */}
                <div className="col-span-3 font-medium text-white flex items-center gap-2 min-w-0 pr-2">
                  <span className="truncate">{issue.title}</span>
                  {childrenCount > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 font-mono shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      <span>
                        {completedChildrenCount}/{childrenCount}
                      </span>
                    </span>
                  )}
                </div>

                {/* Column 3: Status (Interactive Dropdown) */}
                <div className="col-span-2 relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDropdown(isStatusOpen ? null : { issueId: issue.id, type: 'status' })
                    }
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors text-left group/btn cursor-pointer"
                  >
                    <StateBadge state={resolvedState} />
                    <ChevronDown className="w-3 h-3 text-zinc-600 group-hover/btn:text-zinc-300 transition-colors ml-0.5 shrink-0" />
                  </button>

                  {isStatusOpen && (
                    <div
                      className={`absolute ${
                        isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                      } left-0 w-44 bg-[#121417] border border-zinc-800 rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100`}
                    >
                      <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Set Status
                      </div>
                      {states.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={async () => {
                            setActiveDropdown(null);
                            if (onUpdateIssue && s.id !== issue.state_id) {
                              await onUpdateIssue(issue.id, {
                                state_id: s.id,
                                expected_version: issue.version,
                              });
                            }
                          }}
                          className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-zinc-800 transition-colors text-left cursor-pointer ${
                            s.id === issue.state_id ? 'text-white bg-zinc-800/40' : 'text-zinc-400'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: s.color || '#a1a1aa' }}
                            />
                            <span className="truncate">{s.name}</span>
                          </div>
                          {s.id === issue.state_id && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Column 4: Priority (Interactive Dropdown) */}
                <div className="col-span-1 relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDropdown(isPriorityOpen ? null : { issueId: issue.id, type: 'priority' })
                    }
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors group/btn cursor-pointer"
                  >
                    <PriorityBadge priority={issue.priority} showLabel={false} />
                    <ChevronDown className="w-3 h-3 text-zinc-600 group-hover/btn:text-zinc-300 transition-colors shrink-0" />
                  </button>

                  {isPriorityOpen && (
                    <div
                      className={`absolute ${
                        isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                      } left-0 w-36 bg-[#121417] border border-zinc-800 rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100`}
                    >
                      <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Set Priority
                      </div>
                      {PRIORITY_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isCurrent = issue.priority === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={async () => {
                              setActiveDropdown(null);
                              if (onUpdateIssue && opt.value !== issue.priority) {
                                await onUpdateIssue(issue.id, {
                                  priority: opt.value,
                                  expected_version: issue.version,
                                });
                              }
                            }}
                            className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-zinc-800 transition-colors text-left cursor-pointer ${
                              isCurrent ? 'text-white bg-zinc-800/40' : 'text-zinc-400'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className={`w-3.5 h-3.5 ${opt.color}`} />
                              <span>{opt.label}</span>
                            </div>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Column 5: Assignee (Interactive Dropdown) */}
                <div className="col-span-2 relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDropdown(isAssigneeOpen ? null : { issueId: issue.id, type: 'assignee' })
                    }
                    className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors group/btn cursor-pointer max-w-full"
                  >
                    {resolvedAssignee ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {resolvedAssignee.avatar_url ? (
                          <img
                            src={resolvedAssignee.avatar_url}
                            alt=""
                            className="w-4 h-4 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 flex items-center justify-center text-[8px] font-bold shrink-0">
                            {(resolvedAssignee.name || resolvedAssignee.email || 'M')[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-zinc-200 truncate text-xs font-medium">
                          {resolvedAssignee.name || resolvedAssignee.email?.split('@')[0]}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-zinc-500 text-xs">
                        <UserIcon className="w-3.5 h-3.5" />
                        <span>Unassigned</span>
                      </div>
                    )}
                    <ChevronDown className="w-3 h-3 text-zinc-600 group-hover/btn:text-zinc-300 transition-colors shrink-0 ml-auto" />
                  </button>

                  {isAssigneeOpen && (
                    <div
                      className={`absolute ${
                        isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                      } left-0 w-52 bg-[#121417] border border-zinc-800 rounded-lg shadow-2xl py-1 z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}
                    >
                      <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Assign Issue
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setActiveDropdown(null);
                          if (onUpdateIssue && issue.assignee_id) {
                            await onUpdateIssue(issue.id, {
                              assignee_id: undefined,
                              expected_version: issue.version,
                            });
                          }
                        }}
                        className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-zinc-800 transition-colors text-left cursor-pointer ${
                          !issue.assignee_id ? 'text-white bg-zinc-800/40' : 'text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Unassigned</span>
                        </div>
                        {!issue.assignee_id && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                      </button>

                      <div className="my-1 border-t border-zinc-800" />

                      {normalizedUsers.map((u: any) => {
                        const isCurrent = issue.assignee_id === u.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={async () => {
                              setActiveDropdown(null);
                              if (onUpdateIssue && issue.assignee_id !== u.id) {
                                await onUpdateIssue(issue.id, {
                                  assignee_id: u.id,
                                  expected_version: issue.version,
                                });
                              }
                            }}
                            className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-zinc-800 transition-colors text-left cursor-pointer ${
                              isCurrent ? 'text-white bg-zinc-800/40' : 'text-zinc-400'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] font-bold shrink-0 text-zinc-200">
                                  {(u.name || u.email || 'U')[0].toUpperCase()}
                                </div>
                              )}
                              <span className="truncate">{u.name || u.email}</span>
                            </div>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Column 6: Labels (Interactive Dropdown) */}
                <div className="col-span-1 relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDropdown(isLabelsOpen ? null : { issueId: issue.id, type: 'labels' })
                    }
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors group/btn cursor-pointer max-w-full"
                  >
                    {issue.labels && issue.labels.length > 0 ? (
                      <div className="flex items-center gap-1 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: issue.labels[0].color }}
                        />
                        <span className="text-[11px] truncate text-zinc-300">{issue.labels[0].name}</span>
                        {issue.labels.length > 1 && (
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">+{issue.labels.length - 1}</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-zinc-600 text-xs hover:text-zinc-400">
                        <Tag className="w-3 h-3" />
                        <span className="text-[11px]">Add</span>
                      </div>
                    )}
                    <ChevronDown className="w-2.5 h-2.5 text-zinc-600 group-hover/btn:text-zinc-300 transition-colors shrink-0" />
                  </button>

                  {isLabelsOpen && (
                    <div
                      className={`absolute ${
                        isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                      } left-0 w-48 bg-[#121417] border border-zinc-800 rounded-lg shadow-2xl py-1 z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}
                    >
                      <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Toggle Labels
                      </div>
                      {availableLabels.length === 0 ? (
                        <div className="px-2.5 py-2 text-xs text-zinc-600">No labels found</div>
                      ) : (
                        availableLabels.map((lbl) => {
                          const currentLabelIds = (issue.labels || []).map((l) => l.id);
                          const isAttached = currentLabelIds.includes(lbl.id);

                          return (
                            <button
                              key={lbl.id}
                              type="button"
                              onClick={async () => {
                                if (onUpdateIssue) {
                                  const updatedIds = isAttached
                                    ? currentLabelIds.filter((id) => id !== lbl.id)
                                    : [...currentLabelIds, lbl.id];
                                  await onUpdateIssue(issue.id, {
                                    label_ids: updatedIds,
                                    expected_version: issue.version,
                                  });
                                }
                              }}
                              className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs hover:bg-zinc-800 transition-colors text-left cursor-pointer ${
                                isAttached ? 'text-white bg-zinc-800/40' : 'text-zinc-400'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: lbl.color }}
                                />
                                <span className="truncate">{lbl.name}</span>
                              </div>
                              {isAttached && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Column 7: Created Date */}
                <div className="col-span-1 text-right text-zinc-400 text-[11px] font-sans flex items-center justify-end gap-1">
                  <Calendar className="w-3 h-3 text-zinc-600 shrink-0" />
                  <span>
                    {issue.created_at
                      ? new Date(issue.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </span>
                </div>
              </div>
            );
          })}

          {flattenedIssues.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-500 rounded-b-xl">No matching issues found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
