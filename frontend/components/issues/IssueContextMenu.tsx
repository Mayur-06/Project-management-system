'use client';

import React from 'react';
import { Issue, WorkflowState, User, Label, IssuePriority } from '@/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { SignalPriorityIcon } from '@/components/ui/SignalPriorityIcon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Copy, Trash2, Tag, CircleCheck, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';

interface IssueContextMenuProps {
  issue: Issue;
  states?: WorkflowState[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  availableLabels?: Label[];
  onUpdateIssue?: (issueId: string, updates: Partial<Issue> & { label_ids?: string[]; expected_version?: number }) => Promise<void>;
  onDeleteIssue?: (issueId: string) => Promise<void> | void;
  children: React.ReactNode;
}

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; shortcut: string }[] = [
  { value: 'urgent', label: 'Urgent', shortcut: '1' },
  { value: 'high', label: 'High', shortcut: '2' },
  { value: 'medium', label: 'Medium', shortcut: '3' },
  { value: 'low', label: 'Low', shortcut: '4' },
  { value: 'none', label: 'No Priority', shortcut: '0' },
];

export const IssueContextMenu: React.FC<IssueContextMenuProps> = ({
  issue,
  states = [],
  users = [],
  availableLabels = [],
  onUpdateIssue,
  onDeleteIssue,
  children,
}) => {
  const normalizedUsers = React.useMemo(() => {
    return users
      .map((u: any) => u.user || u)
      .filter((u: any): u is User => Boolean(u && (u.id || u.user_id)));
  }, [users]);

  const activeLabelIds = React.useMemo(() => {
    return (issue.labels || []).map((l) => l.id);
  }, [issue.labels]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}${window.location.pathname}`;
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  const handleCopyIdentifier = () => {
    navigator.clipboard.writeText(issue.identifier);
    toast.success(`Copied ${issue.identifier} to clipboard`);
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(issue.title);
    toast.success('Title copied to clipboard');
  };

  const handleDelete = async () => {
    if (onDeleteIssue) {
      await onDeleteIssue(issue.id);
      toast.success(`Issue ${issue.identifier} deleted`);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        {/* Status Submenu */}
        {states.length > 0 && onUpdateIssue && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <div className="flex items-center gap-2">
                <StatusIcon state={issue.state || states.find((s) => s.id === issue.state_id)} size="xs" />
                <span>Status</span>
              </div>
              <ContextMenuShortcut>S</ContextMenuShortcut>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {states.map((st) => {
                const isSelected = (issue.state_id || issue.state?.id) === st.id;
                return (
                  <ContextMenuItem
                    key={st.id}
                    onClick={() =>
                      onUpdateIssue(issue.id, {
                        state_id: st.id,
                        expected_version: issue.version,
                      })
                    }
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <StatusIcon state={st} size="xs" />
                      <span>{st.name}</span>
                    </div>
                    {isSelected && <CircleCheck className="w-3.5 h-3.5 text-zinc-300" />}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Priority Submenu */}
        {onUpdateIssue && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <div className="flex items-center gap-2">
                <SignalPriorityIcon priority={issue.priority} size="xs" />
                <span>Priority</span>
              </div>
              <ContextMenuShortcut>P</ContextMenuShortcut>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              {PRIORITY_OPTIONS.map((opt) => {
                const isSelected = issue.priority === opt.value;
                return (
                  <ContextMenuItem
                    key={opt.value}
                    onClick={() =>
                      onUpdateIssue(issue.id, {
                        priority: opt.value,
                        expected_version: issue.version,
                      })
                    }
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <SignalPriorityIcon priority={opt.value} size="xs" />
                      <span>{opt.label}</span>
                    </div>
                    <ContextMenuShortcut>{opt.shortcut}</ContextMenuShortcut>
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Assignee Submenu */}
        {onUpdateIssue && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <div className="flex items-center gap-2">
                <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                <span>Assignee</span>
              </div>
              <ContextMenuShortcut>A</ContextMenuShortcut>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-52 max-h-60 overflow-y-auto">
              <ContextMenuItem
                onClick={() =>
                  onUpdateIssue(issue.id, {
                    assignee_id: undefined,
                    expected_version: issue.version,
                  })
                }
                className="flex items-center justify-between"
              >
                <span>Unassigned</span>
                {!issue.assignee_id && <CircleCheck className="w-3.5 h-3.5 text-zinc-300" />}
              </ContextMenuItem>

              {normalizedUsers.map((u) => {
                const isSelected = issue.assignee_id === u.id;
                return (
                  <ContextMenuItem
                    key={u.id}
                    onClick={() =>
                      onUpdateIssue(issue.id, {
                        assignee_id: u.id,
                        expected_version: issue.version,
                      })
                    }
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar name={u.name} email={u.email} avatarUrl={u.avatar_url} size="xs" />
                      <span className="truncate">{u.name || u.email}</span>
                    </div>
                    {isSelected && <CircleCheck className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Labels Submenu */}
        {availableLabels.length > 0 && onUpdateIssue && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-zinc-400" />
                <span>Labels</span>
              </div>
              <ContextMenuShortcut>L</ContextMenuShortcut>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48 max-h-60 overflow-y-auto">
              {availableLabels.map((lbl) => {
                const isSelected = activeLabelIds.includes(lbl.id);
                return (
                  <ContextMenuItem
                    key={lbl.id}
                    onClick={() => {
                      const next = isSelected
                        ? activeLabelIds.filter((id) => id !== lbl.id)
                        : [...activeLabelIds, lbl.id];
                      onUpdateIssue(issue.id, {
                        label_ids: next,
                        expected_version: issue.version,
                      });
                    }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: lbl.color || '#71717a' }}
                      />
                      <span className="truncate">{lbl.name}</span>
                    </div>
                    {isSelected && <CircleCheck className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuSeparator />

        {/* Copy Actions */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <div className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
              <span>Copy</span>
            </div>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem onClick={handleCopyIdentifier}>
              <span>Copy identifier</span>
              <ContextMenuShortcut>⇧I</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyTitle}>
              <span>Copy title</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyLink}>
              <span>Copy link</span>
              <ContextMenuShortcut>⇧C</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Delete Action */}
        {onDeleteIssue && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={handleDelete}
              className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Delete</span>
              </div>
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
