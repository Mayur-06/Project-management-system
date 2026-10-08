'use client';

import React, { useMemo } from 'react';
import { Issue, WorkflowState, User, Label } from '@/types';
import { SignalPriorityIcon } from '@/components/ui/SignalPriorityIcon';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { StatusPicker } from '@/components/ui/StatusPicker';
import { PriorityPicker } from '@/components/ui/PriorityPicker';
import { AssigneePicker } from '@/components/ui/AssigneePicker';
import { LabelPicker } from '@/components/ui/LabelPicker';
import { IssueContextMenu } from '@/components/issues/IssueContextMenu';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { buildIssueTree } from '@/lib/issueTree';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface IssueListViewProps {
  issues: Issue[];
  states?: WorkflowState[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  availableLabels?: Label[];
  onSelectIssue: (issue: Issue) => void;
  onUpdateIssue?: (issueId: string, updates: Partial<Issue> & { label_ids?: string[]; expected_version?: number }) => Promise<void>;
  onDeleteIssue?: (issueId: string) => Promise<void> | void;
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

export const IssueListView: React.FC<IssueListViewProps> = ({
  issues,
  states = [],
  users = [],
  availableLabels = [],
  onSelectIssue,
  onUpdateIssue,
  onDeleteIssue,
}) => {
  const tree = useMemo(() => buildIssueTree(issues), [issues]);

  const normalizedUsers = useMemo(() => {
    return users.map((u: any) => u.user || u).filter(Boolean);
  }, [users]);

  // Flatten issues into tree order so subtasks appear under parent with guide lines
  const flattenedIssues = useMemo(() => {
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
  }, [tree]);

  if (flattenedIssues.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-500 font-sans">
        <p className="text-sm">No issues found.</p>
        <p className="text-xs text-zinc-600 mt-1">Create issues or subissues to view them in the list.</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-6 font-sans select-none pb-32">
        <div className="min-w-[700px] flex flex-col space-y-1">
          {flattenedIssues.map((row) => {
            const {
              issue,
              depth,
              isLastChild,
              childrenCount,
              completedChildrenCount,
              ancestorGuides,
            } = row;

            const resolvedState =
              issue.state || states.find((s) => s.id === issue.state_id);

            const resolvedAssignee =
              issue.assignee ||
              (issue.assignee_id
                ? (normalizedUsers.find((u: any) => u.id === issue.assignee_id) as any)
                : null);

            const formattedDate = formatRelativeMonthDay(issue.created_at);

            // Subtask progress ring calculation
            const progressFraction =
              childrenCount > 0 ? completedChildrenCount / childrenCount : 0;
            const radius = 4.5;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference * (1 - progressFraction);

            return (
              <IssueContextMenu
                key={issue.id}
                issue={issue}
                states={states}
                users={users}
                availableLabels={availableLabels}
                onUpdateIssue={onUpdateIssue}
                onDeleteIssue={onDeleteIssue}
              >
                <div
                  onClick={() => onSelectIssue(issue)}
                  className="group flex items-center justify-between min-h-[38px] py-2 px-3.5 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer text-xs relative select-none"
                >
                  {/* Left side: Tree Guide Lines + Priority + Identifier + Status + Title + Labels + Progress */}
                  <div className="flex items-center min-w-0 flex-1 gap-3 mr-4">
                    {/* Indent & Guide Lines for depth > 0 matching Image 1 */}
                    {depth > 0 && (
                      <div
                        className="flex items-center shrink-0 self-stretch"
                        style={{ width: `${depth * 24}px` }}
                      >
                        {ancestorGuides.map((hasGuide, gIdx) => (
                          <div
                            key={gIdx}
                            className="w-6 h-full relative shrink-0 flex items-center justify-center"
                          >
                            {hasGuide && (
                              <div className="absolute top-0 bottom-0 left-3 w-px bg-white/[0.12]" />
                            )}
                          </div>
                        ))}

                        {/* Current level branch connector (L-corner or T-junction) */}
                        <div className="w-6 h-full relative shrink-0">
                          {/* Upper vertical line coming down to center */}
                          <div className="absolute top-0 left-3 w-px h-1/2 bg-white/[0.12]" />
                          {/* Lower vertical line if there are more siblings */}
                          {!isLastChild && (
                            <div className="absolute top-1/2 bottom-0 left-3 w-px bg-white/[0.12]" />
                          )}
                          {/* Horizontal branch line connecting to the item */}
                          <div className="absolute top-1/2 left-3 right-0 h-px bg-white/[0.12]" />
                        </div>
                      </div>
                    )}

                    {/* Priority Signal Icon with Interactive Direct-Click Picker */}
                    <div
                      className="shrink-0 flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onUpdateIssue ? (
                        <PriorityPicker
                          currentPriority={issue.priority}
                          showLabel={false}
                          showChevron={false}
                          triggerClassName="p-1 h-auto bg-transparent border-0 hover:bg-white/[0.08] shadow-none rounded cursor-pointer"
                          onSelectPriority={async (newPriority) => {
                            await onUpdateIssue(issue.id, {
                              priority: newPriority,
                              expected_version: issue.version,
                            });
                          }}
                        />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center">
                              <SignalPriorityIcon priority={issue.priority} size="sm" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px] py-1 px-2">
                            Priority: {issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1)}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Identifier */}
                    <span className="shrink-0 font-mono text-[12px] text-zinc-400 group-hover:text-zinc-200 transition-colors">
                      {issue.identifier}
                    </span>

                    {/* Status Icon with Interactive Direct-Click Picker */}
                    <div
                      className="shrink-0 flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onUpdateIssue && states.length > 0 ? (
                        <StatusPicker
                          states={states}
                          currentStateId={issue.state_id}
                          currentState={resolvedState}
                          showLabel={false}
                          showChevron={false}
                          triggerClassName="p-1 h-auto bg-transparent border-0 hover:bg-white/[0.08] shadow-none rounded cursor-pointer"
                          onSelectState={async (newStateId) => {
                            if (newStateId !== issue.state_id) {
                              await onUpdateIssue(issue.id, {
                                state_id: newStateId,
                                expected_version: issue.version,
                              });
                            }
                          }}
                        />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center">
                              <StatusIcon state={resolvedState} size="sm" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px] py-1 px-2">
                            Status: {resolvedState?.name || 'Backlog'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Issue Title */}
                    <span className="text-[13px] font-medium text-zinc-200 group-hover:text-white transition-colors truncate min-w-0">
                      {issue.title}
                    </span>

                    {/* Labels Matching Image 3 */}
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {issue.labels && issue.labels.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {issue.labels.map((lbl) => (
                            <span
                              key={lbl.id}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-zinc-300 border border-white/[0.04]"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: lbl.color || '#a1a1aa' }}
                              />
                              <span>{lbl.name}</span>
                            </span>
                          ))}
                          {onUpdateIssue && (
                            <LabelPicker
                              availableLabels={availableLabels}
                              selectedLabelIds={(issue.labels || []).map((l) => l.id)}
                              onToggleLabel={async (labelId) => {
                                const currentIds = (issue.labels || []).map((l) => l.id);
                                const nextIds = currentIds.includes(labelId)
                                  ? currentIds.filter((id) => id !== labelId)
                                  : [...currentIds, labelId];
                                await onUpdateIssue(issue.id, {
                                  label_ids: nextIds,
                                  expected_version: issue.version,
                                });
                              }}
                              triggerClassName="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-300 transition-opacity"
                            />
                          )}
                        </div>
                      ) : onUpdateIssue && availableLabels.length > 0 ? (
                        <LabelPicker
                          availableLabels={availableLabels}
                          selectedLabelIds={[]}
                          onToggleLabel={async (labelId) => {
                            await onUpdateIssue(issue.id, {
                              label_ids: [labelId],
                              expected_version: issue.version,
                            });
                          }}
                          triggerClassName="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-300 transition-opacity"
                        />
                      ) : null}
                    </div>

                    {/* Subtask Progress Badge matching Image 1 */}
                    {childrenCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400 shrink-0">
                            {/* Circular Progress Ring */}
                            <svg className="w-3.5 h-3.5 -rotate-90 shrink-0" viewBox="0 0 12 12">
                              <circle
                                cx="6"
                                cy="6"
                                r={radius}
                                fill="none"
                                stroke="currentColor"
                                strokeOpacity="0.2"
                                strokeWidth="1.5"
                              />
                              <circle
                                cx="6"
                                cy="6"
                                r={radius}
                                fill="none"
                                stroke={
                                  completedChildrenCount === childrenCount
                                    ? '#5e6ad2'
                                    : progressFraction > 0
                                    ? '#7170ff'
                                    : '#71717a'
                                }
                                strokeWidth="1.5"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="leading-none text-[10px]">
                              {completedChildrenCount}/{childrenCount}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px] py-1 px-2">
                          {completedChildrenCount} of {childrenCount} subtasks completed
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* Right side: Assignee Direct-Click Picker + Formatted Date */}
                  <div className="flex items-center gap-3 shrink-0 ml-auto pr-1">
                    <div
                      className="shrink-0 flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onUpdateIssue ? (
                        <AssigneePicker
                          users={users}
                          currentAssigneeId={issue.assignee_id}
                          currentAssignee={resolvedAssignee}
                          showLabel={false}
                          showChevron={false}
                          triggerClassName="p-0.5 h-auto bg-transparent border-0 hover:bg-white/[0.08] shadow-none rounded cursor-pointer"
                          onSelectAssignee={async (newAssigneeId) => {
                            if (newAssigneeId !== (issue.assignee_id || null)) {
                              await onUpdateIssue(issue.id, {
                                assignee_id: newAssigneeId || undefined,
                                expected_version: issue.version,
                              });
                            }
                          }}
                        />
                      ) : resolvedAssignee ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="shrink-0">
                              <UserAvatar
                                name={resolvedAssignee.name}
                                email={resolvedAssignee.email}
                                avatarUrl={resolvedAssignee.avatar_url}
                                size="xs"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px] py-1 px-2">
                            Assigned to: {resolvedAssignee.name || resolvedAssignee.email}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>

                    {formattedDate && (
                      <span className="text-[11px] font-sans text-zinc-500 shrink-0">
                        {formattedDate}
                      </span>
                    )}
                  </div>
                </div>
              </IssueContextMenu>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};
