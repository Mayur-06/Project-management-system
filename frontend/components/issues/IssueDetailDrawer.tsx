'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { Issue, IssueComment, ActivityLog, IssuePriority, WorkflowState, IssueAttachment, User } from '@/types';
import { api } from '@/lib/api';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { PriorityPicker } from '@/components/ui/PriorityPicker';
import { StateBadge } from '@/components/ui/StateBadge';
import { StatusPicker } from '@/components/ui/StatusPicker';
import { IssueSubtasksTree } from '@/components/issues/IssueSubtasksTree';
import { IssueTitleEditor } from '@/components/issues/IssueTitleEditor';
import { IssueDescriptionEditor } from '@/components/editor/IssueDescriptionEditor';
import { IssueActivityFeed } from '@/components/issues/IssueActivityFeed';
import { IssueAttachmentButton } from '@/components/issues/IssueAttachmentButton';
import { toast } from 'sonner';

interface IssueDetailDrawerProps {
  issue: Issue | null;
  states?: WorkflowState[];
  users?: User[];
  onClose: () => void;
  onUpdateIssue: (updated: Issue) => void;
}

export const IssueDetailDrawer: React.FC<IssueDetailDrawerProps> = ({
  issue,
  states = [],
  users = [],
  onClose,
  onUpdateIssue,
}) => {
  const activeStates = states;
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [attachments, setAttachments] = useState<IssueAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Manual subtask creation state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskPriority, setNewSubtaskPriority] = useState<IssuePriority>('none');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState<string>('');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const assignableUsers: User[] = React.useMemo(() => {
    const map = new Map<string, User>();
    (users || []).forEach((u) => {
      if (u.id) map.set(u.id, u);
    });
    teamMembers.forEach((tm) => {
      const u = tm.user || { id: tm.user_id, name: tm.user_id };
      if (u.id && !map.has(u.id)) {
        map.set(u.id, { id: u.id, name: u.name || u.email, email: u.email });
      }
    });
    return Array.from(map.values());
  }, [users, teamMembers]);

  useEffect(() => {
    if (issue) {
      api.getComments(issue.id).then(setComments);
      api.getActivityLogs(issue.id).then(setActivityLogs);
      api.getAttachments(issue.id).then(setAttachments);
      api.getTeamMembers(issue.team_id).then(setTeamMembers).catch(() => setTeamMembers([]));
      setUploadError(null);
      setNewSubtaskTitle('');
      setNewSubtaskPriority('none');
      setNewSubtaskAssigneeId('');
    }
  }, [issue]);

  if (!issue) return null;

  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || isAddingSubtask) return;
    setIsAddingSubtask(true);
    try {
      const created = await api.createSubtask(issue.id, {
        title: newSubtaskTitle.trim(),
        priority: newSubtaskPriority,
        assignee_id: newSubtaskAssigneeId || undefined,
      });
      if (created) {
        try {
          const fullIssue = await api.getIssue(issue.id);
          if (fullIssue) {
            onUpdateIssue(fullIssue);
          } else {
            onUpdateIssue({
              ...issue,
              subtasks: [...(issue.subtasks || []), created],
            });
          }
        } catch {
          onUpdateIssue({
            ...issue,
            subtasks: [...(issue.subtasks || []), created],
          });
        }
        window.dispatchEvent(new CustomEvent('issueCreated', { detail: created }));
        setNewSubtaskTitle('');
        setNewSubtaskPriority('none');
        setNewSubtaskAssigneeId('');
      }
    } catch (err) {
      console.error('Failed to create subtask', err);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleDeleteIssue = async () => {
    if (!issue) return;
    setIsDeleting(true);
    try {
      const ok = await api.deleteIssue(issue.id, false);
      if (ok) {
        toast.success(`Deleted ${issue.identifier}`);
        window.dispatchEvent(new CustomEvent('issueDeleted', { detail: issue.id }));
        onClose();
      } else {
        toast.error('Failed to delete issue');
      }
    } catch (err: any) {
      console.error('Failed to delete issue', err);
      toast.error(err?.message || 'Failed to delete issue');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (stateId: string) => {
    try {
      const updated = await api.updateIssue(issue.id, {
        state_id: stateId,
        expected_version: issue.version,
      });
      if (updated) {
        onUpdateIssue(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePriorityChange = async (priority: IssuePriority) => {
    try {
      const updated = await api.updateIssue(issue.id, {
        priority,
        expected_version: issue.version,
      });
      if (updated) {
        onUpdateIssue(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTitleChange = async (newTitle: string) => {
    try {
      const updated = await api.updateIssue(issue.id, {
        title: newTitle,
        expected_version: issue.version,
      });
      if (updated) {
        onUpdateIssue(updated);
        toast.success('Title updated');
      }
    } catch (err) {
      console.error('Failed to update title', err);
      toast.error('Failed to update title');
    }
  };

  const handleDescriptionChange = async (data: { description_text: string; description_json: any }) => {
    try {
      const updated = await api.updateIssue(issue.id, {
        description_text: data.description_text,
        description_json: data.description_json,
        expected_version: issue.version,
      });
      if (updated) {
        onUpdateIssue(updated);
      }
    } catch (err) {
      console.error('Failed to update description', err);
      toast.error('Failed to save description');
    }
  };

  const handleAddComment = async (text: string) => {
    try {
      const added = await api.addComment(issue.id, text);
      if (added) {
        setComments((prev) => [...prev, added]);
        toast.success('Comment posted');
      }
    } catch (err) {
      console.error('Failed to post comment', err);
      toast.error('Failed to post comment');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !issue) return;

    if (file.size > 52428800) {
      setUploadError('File size exceeds the 50MB limit.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      // 1. Request pre-signed upload URL from backend
      const uploadData = await api.getUploadUrl(issue.id, file.name, file.size, file.type || 'application/octet-stream');
      if (!uploadData) {
        setUploadError('Failed to generate upload URL. Please try again.');
        setIsUploading(false);
        return;
      }

      // 2. Perform direct upload to storage endpoint (or simulation in local dev)
      try {
        await fetch(uploadData.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
      } catch {
        // Fallback for mock environments
      }

      // 3. Refresh attachments list
      const freshAttachments = await api.getAttachments(issue.id);
      setAttachments(freshAttachments);
    } catch (err: any) {
      setUploadError(err?.message || 'Error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const success = await api.deleteAttachment(attachmentId);
    if (success) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-xs animate-fade-in font-sans">
      <div className="w-full max-w-3xl h-full bg-black border-l border-zinc-800 flex flex-col shadow-2xl overflow-hidden animate-fade-in">
        {/* Drawer Header */}
        <div className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono font-bold text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
              {issue.identifier}
            </span>
            {issue.creator?.name && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400">Created by {issue.creator.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteIssue}
              disabled={isDeleting}
              className="w-7 h-7 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40 flex items-center justify-center transition-colors cursor-pointer"
              title="Delete Issue Permanently"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Column */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <IssueTitleEditor
              initialTitle={issue.title}
              onSave={handleTitleChange}
            />

            {/* Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Description
                </h3>
                <IssueAttachmentButton
                  attachments={attachments}
                  onUpload={handleFileUpload}
                  isUploading={isUploading}
                  uploadError={uploadError}
                />
              </div>
              <IssueDescriptionEditor
                issueId={issue.id}
                initialText={issue.description_text}
                initialJson={issue.description_json}
                onSave={handleDescriptionChange}
              />
            </div>

            {/* Sub-tasks Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <span>Sub-tasks</span>
                  <span className="text-zinc-400 font-mono">({issue.subtasks?.length || 0})</span>
                </h3>
              </div>

              {/* Inline Add Sub-task form with properties */}
              <form onSubmit={handleCreateSubtask} className="space-y-2 p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="+ Add sub-task title..."
                    className="flex-1 bg-zinc-900/60 border border-zinc-800 focus:border-indigo-500 rounded px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newSubtaskTitle.trim() || isAddingSubtask}
                    className="px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAddingSubtask ? 'Adding...' : 'Add Subtask'}
                  </button>
                </div>

                {/* Subtask Property Selectors */}
                <div className="flex items-center gap-2 pt-1 flex-wrap text-xs">
                  {/* Assignee Selector */}
                  <select
                    value={newSubtaskAssigneeId}
                    onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-700 cursor-pointer"
                  >
                    <option value="">👤 Unassigned</option>
                    {assignableUsers.map((m: any) => (
                      <option key={m.id || m.user_id} value={m.user_id || m.id}>
                        {m.name || m.user?.name || m.user?.email || 'Member'}
                      </option>
                    ))}
                  </select>

                  {/* Priority Selector */}
                  <PriorityPicker
                    currentPriority={newSubtaskPriority}
                    onSelectPriority={(pr) => setNewSubtaskPriority(pr)}
                    triggerClassName="bg-zinc-900 border-zinc-800 text-zinc-300 px-2 py-1 text-[11px] h-7"
                  />
                </div>
              </form>

              {issue.subtasks && issue.subtasks.length > 0 ? (
                <div className="p-2.5 rounded-lg bg-black border border-zinc-900/80">
                  <IssueSubtasksTree
                    rootIssue={issue}
                    subtasks={issue.subtasks}
                    orgSlug={issue.organization_id || ''}
                    teamKey={issue.identifier?.split('-')[0] || ''}
                    users={assignableUsers}
                    onSelectIssue={(sub) => {
                      onUpdateIssue(sub);
                    }}
                    onAddSubtaskToParent={() => {
                      const input = document.querySelector('input[placeholder*="Add sub-task"]') as HTMLInputElement | null;
                      if (input) input.focus();
                    }}
                  />
                </div>
              ) : (
                <div className="py-3 text-center rounded border border-dashed border-zinc-900 text-xs text-zinc-500">
                  No sub-tasks yet. Use "+ Add sub-task" above.
                </div>
              )}
            </div>

            {/* Unified Activity & Comments Stream */}
            <IssueActivityFeed
              issue={issue}
              comments={comments}
              activityLogs={activityLogs}
              states={states}
              users={assignableUsers}
              onAddComment={handleAddComment}
            />
          </div>

          {/* Right Properties Sidebar */}
          <div className="w-64 border-l border-zinc-800 p-4 bg-zinc-950 space-y-4 text-xs">
            <h3 className="font-semibold uppercase tracking-wider text-zinc-400 text-[11px]">Properties</h3>

            {/* Status */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Status</label>
              <StatusPicker
                states={activeStates}
                currentStateId={issue.state_id}
                currentState={issue.state}
                onSelectState={handleStatusChange}
                triggerClassName="w-full justify-between h-8 bg-zinc-900 border-zinc-800 hover:border-zinc-700"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Priority</label>
              <PriorityPicker
                currentPriority={issue.priority}
                onSelectPriority={handlePriorityChange}
                triggerClassName="w-full justify-between h-8 bg-zinc-900 border-zinc-800 hover:border-zinc-700"
              />
            </div>

            {/* Assigned to */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Assigned to</label>
              <select
                value={issue.assignee_id || ''}
                onChange={async (e) => {
                  const newAssigneeId = e.target.value || null;
                  try {
                    const updated = await api.updateIssue(issue.id, {
                      expected_version: issue.version,
                      assignee_id: newAssigneeId as any,
                    });
                    if (updated) {
                      onUpdateIssue(updated);
                    }
                  } catch (err) {
                    console.error('Failed to update assignee', err);
                  }
                }}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded p-2 focus:border-indigo-500 focus:outline-none cursor-pointer"
              >
                <option value="">👤 Unassigned</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignment provenance */}
            <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Assigned by</span>
                <span className="text-zinc-300 font-medium truncate max-w-[120px]">
                  {issue.assigned_by?.name || issue.creator?.name || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-800/40 pt-1.5">
                <span className="text-zinc-500">Created by</span>
                <span className="text-zinc-300 font-medium truncate max-w-[120px]">
                  {issue.creator?.name || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
