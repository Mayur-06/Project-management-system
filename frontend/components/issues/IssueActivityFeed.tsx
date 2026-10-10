'use client';

import React, { useState, useMemo } from 'react';
import { ActivityLog, IssueComment, User, Issue, WorkflowState } from '@/types';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  MessageSquare,
  Paperclip,
  Pencil,
  Clock,
  PlusCircle,
  CornerDownRight,
  Send,
  Loader2,
  ExternalLink,
  CalendarClock,
  CirclePlay,
  Tag,
  ArrowUp,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface IssueActivityFeedProps {
  issue: Issue;
  comments: IssueComment[];
  activityLogs: ActivityLog[];
  states?: WorkflowState[];
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string } | any)[];
  currentUserId?: string;
  onAddComment: (commentText: string) => Promise<void> | void;
  onUpdateComment?: (commentId: string, commentText: string) => Promise<void> | void;
  onDeleteComment?: (commentId: string) => Promise<void> | void;
  className?: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 60) return 'just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return `${diffWeeks}w ago`;
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

function renderFormattedBody(text: string) {
  // Regex to split mentions (@username) and URLs (https://...)
  const parts = text.split(/(@[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+|@[a-zA-Z0-9._-]+|https?:\/\/[^\s]+)/g);

  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={index}
          className="font-medium text-[#7170ff] bg-[#7170ff]/10 px-1 py-0.5 rounded text-[11px]"
        >
          {part}
        </span>
      );
    }
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#7170ff] hover:underline underline-offset-2 break-all inline-flex items-center gap-0.5"
        >
          <span>{part}</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0 inline" />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export const IssueActivityFeed: React.FC<IssueActivityFeedProps> = ({
  issue,
  comments,
  activityLogs,
  states = [],
  users = [],
  currentUserId,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  className,
}) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Map state ID to WorkflowState object
  const statesMap = useMemo(() => {
    const map = new Map<string, WorkflowState>();
    states.forEach((s) => map.set(s.id, s));
    return map;
  }, [states]);

  // Map user ID to User object
  const usersMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => {
      if (u.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddComment(commentText.trim());
      setCommentText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (comment: IssueComment) => {
    setEditingCommentId(comment.id);
    setEditingText(comment.body_text);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!onUpdateComment || !editingText.trim() || isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateComment(commentId, editingText.trim());
      setEditingCommentId(null);
      setEditingText('');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!onDeleteComment || deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      await onDeleteComment(commentId);
      toast.success('Comment deleted');
    } catch {
      toast.error('Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const renderActivityItem = (log: ActivityLog) => {
    const actorName = log.actor?.name || log.actor?.email || 'Team member';
    const timeAgo = formatRelativeTime(log.created_at);
    const changes = log.changes || {};

    // 1. Issue created (Creator UserAvatar) - Prioritized before change checks
    if (log.action === 'issue_created') {
      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <UserAvatar name={log.actor?.name} email={log.actor?.email} avatarUrl={log.actor?.avatar_url} size="xs" />
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            <span>created the issue</span>
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // 2. State change (Linear StatusIcon matching screenshot)
    if (changes.state_id || log.action === 'state_changed') {
      const oldState = changes.state_id?.old ? statesMap.get(changes.state_id.old) : null;
      const newState = changes.state_id?.new ? statesMap.get(changes.state_id.new) : null;

      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            {newState ? (
              <StatusIcon
                category={newState.category}
                name={newState.name}
                color={newState.color}
                size={14}
              />
            ) : (
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            <span>moved from</span>{' '}
            <span className="text-text-primary font-medium">{oldState?.name || 'Previous'}</span>{' '}
            <span>to</span>{' '}
            <span className="text-text-primary font-medium">{newState?.name || 'New'}</span>
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // 3. Title change (Pencil icon matching screenshot) - strictly check that changes.title is an object with new value
    if (changes.title && typeof changes.title === 'object' && changes.title.new) {
      const newTitle = changes.title.new;
      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <Pencil className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            <span>changed title to</span>{' '}
            <span className="text-text-primary font-medium truncate">"{newTitle}"</span>
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // 4. Priority change (Actor UserAvatar matching screenshot)
    if (changes.priority && typeof changes.priority === 'object') {
      const newPri = changes.priority.new || 'none';
      const oldPri = changes.priority.old || 'none';
      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <UserAvatar name={log.actor?.name} email={log.actor?.email} avatarUrl={log.actor?.avatar_url} size="xs" />
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            <span>changed priority from</span>{' '}
            <span className="text-text-primary capitalize">{oldPri}</span>{' '}
            <span>to</span>{' '}
            <span className="text-text-primary font-medium capitalize">{newPri}</span>
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // 5. Assignee change (Actor UserAvatar matching screenshot)
    if (changes.assignee_id && typeof changes.assignee_id === 'object') {
      const newAssignee = changes.assignee_id.new
        ? usersMap.get(changes.assignee_id.new)?.name || usersMap.get(changes.assignee_id.new)?.email || 'teammate'
        : 'unassigned';
      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <UserAvatar name={log.actor?.name} email={log.actor?.email} avatarUrl={log.actor?.avatar_url} size="xs" />
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            <span>assigned to</span>{' '}
            <span className="text-text-primary font-medium">{newAssignee}</span>
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // 6. Due date change or set (Red CalendarClock matching screenshot)
    if ((changes.due_date && typeof changes.due_date === 'object') || log.action?.includes('due_date')) {
      const oldDate = changes.due_date?.old;
      const newDate = changes.due_date?.new;
      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <CalendarClock className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            {oldDate ? (
              <>
                <span>changed the due date from</span>{' '}
                <span className="text-text-primary font-medium">{oldDate}</span>{' '}
                <span>to</span>{' '}
                <span className="text-text-primary font-medium">{newDate || 'None'}</span>
              </>
            ) : (
              <>
                <span>set the due date to</span>{' '}
                <span className="text-text-primary font-medium">{newDate || 'None'}</span>
              </>
            )}
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // 7. Cycle change / removed (CirclePlay matching screenshot)
    if (changes.cycle_id || log.action?.includes('cycle')) {
      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <CirclePlay className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            <span>{log.action.replace(/_/g, ' ')}</span>
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // 8. Labels change (Tag / colored bullet matching screenshot)
    if (changes.labels || log.action?.includes('label')) {
      return (
        <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <Tag className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="flex-1 truncate">
            <span className="text-text-secondary font-normal">{actorName}</span>{' '}
            <span>updated labels</span>
          </div>
          <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
        </div>
      );
    }

    // Fallback activity
    return (
      <div key={log.id} className="flex items-center gap-2.5 text-xs text-text-tertiary">
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="flex-1 truncate">
          <span className="text-text-secondary font-normal">{actorName}</span>{' '}
          <span>{log.action.replace(/_/g, ' ')}</span>
        </div>
        <span className="text-[11px] text-text-quaternary shrink-0">&middot; {timeAgo}</span>
      </div>
    );
  };

  return (
    <div className={cn('space-y-5 font-sans pt-4 border-t border-border-subtle', className)}>
      {/* Activity Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary tracking-tight">Activity</h3>
      </div>

      {/* Activity Timeline Rows */}
      {activityLogs.length > 0 && (
        <div className="space-y-2.5 pl-0.5">
          {activityLogs.slice(0, 20).map(renderActivityItem)}
        </div>
      )}

      {/* Comments Section */}
      <div className="space-y-3 pt-2">
        {comments.length > 0 && (
          <div className="rounded-xl bg-[#0f1011] border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
            {comments.map((comment) => {
              const authorUser = comment.user || usersMap.get(comment.user_id);
              const authorName = authorUser?.name || authorUser?.email || 'Workspace Member';
              const timeAgo = formatRelativeTime(comment.created_at);
              const isEdited =
                comment.updated_at &&
                new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 10000;
              const isAuthor = Boolean(currentUserId && comment.user_id === currentUserId);
              const isEditingThis = editingCommentId === comment.id;

              return (
                <div key={comment.id} className="p-3.5 space-y-1.5 group">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        name={authorUser?.name}
                        email={authorUser?.email}
                        avatarUrl={authorUser?.avatar_url}
                        size="sm"
                      />
                      <span className="font-semibold text-text-primary">{authorName}</span>
                      <span className="text-[11px] text-text-quaternary font-mono">
                        {timeAgo} {isEdited && <span className="opacity-70">(edited)</span>}
                      </span>
                    </div>

                    {isAuthor && !isEditingThis && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onUpdateComment && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(comment)}
                            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                            title="Edit comment"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {onDeleteComment && (
                          <button
                            type="button"
                            onClick={() => handleDelete(comment.id)}
                            disabled={deletingCommentId === comment.id}
                            className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-40"
                            title="Delete comment"
                          >
                            {deletingCommentId === comment.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditingThis ? (
                    <div className="pl-7 pt-1 space-y-2">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={2}
                        className="w-full bg-white/[0.04] border border-white/[0.1] focus:border-[#5e6ad2] rounded p-2 text-xs text-white placeholder-zinc-500 outline-none resize-none leading-relaxed"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={isUpdating}
                          className="px-2 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(comment.id)}
                          disabled={!editingText.trim() || isUpdating}
                          className="px-2.5 py-1 rounded bg-[#5e6ad2] hover:bg-[#7170ff] text-white text-xs font-medium cursor-pointer disabled:opacity-40 flex items-center gap-1"
                        >
                          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-text-secondary leading-relaxed pl-7 break-words whitespace-pre-wrap">
                      {renderFormattedBody(comment.body_text)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Comment Composer */}
        <form
          onSubmit={handleSubmitComment}
          className="rounded-xl bg-[#121316] border border-white/[0.08] focus-within:border-white/[0.15] transition-colors p-3 space-y-2 shadow-sm"
        >
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                handleSubmitComment(e);
              }
            }}
            placeholder="Leave a comment..."
            rows={2}
            className="w-full bg-transparent border-0 text-xs text-zinc-200 placeholder:text-zinc-500 focus:ring-0 focus:outline-none resize-none leading-relaxed font-sans"
          />

          <div className="flex items-center justify-between pt-1 border-t border-white/[0.03]">
            <span className="text-[10px] text-zinc-500 font-mono">
              Ctrl+Enter to post
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                title="Attach file"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <button
                type="submit"
                disabled={!commentText.trim() || isSubmitting}
                className="w-6 h-6 rounded-full bg-[#5e6ad2] hover:bg-[#7170ff] text-white flex items-center justify-center transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Post comment"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
