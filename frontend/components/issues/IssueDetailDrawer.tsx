'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Send,
  CheckCircle2,
  CornerDownRight,
  MessageSquare,
  Activity,
  User as UserIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  FileText,
  Download,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Issue, IssueComment, ActivityLog, IssuePriority, WorkflowState, IssueAttachment, User } from '@/types';
import { api } from '@/lib/api';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';
import { StatusPicker } from '@/components/ui/StatusPicker';
import { IssueSubtasksTree } from '@/components/issues/IssueSubtasksTree';
import { IssueTitleEditor } from '@/components/issues/IssueTitleEditor';
import { IssueDescriptionEditor } from '@/components/editor/IssueDescriptionEditor';
import { toast } from 'sonner';

interface ProposedSubtaskItem {
  title: string;
  description?: string;
  priority?: IssuePriority;
}

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
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'ai_breakdown' | 'attachments'>('comments');
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [attachments, setAttachments] = useState<IssueAttachment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // AI Spec & Subtask breakdown state
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [breakdownThreadId, setBreakdownThreadId] = useState<string | null>(null);
  const [breakdownPrdSpec, setBreakdownPrdSpec] = useState<string | null>(null);
  const [showPrdSpec, setShowPrdSpec] = useState(false);
  const [proposedSubtasks, setProposedSubtasks] = useState<ProposedSubtaskItem[]>([]);
  const [breakdownComplete, setBreakdownComplete] = useState(false);
  const [customDraftTitle, setCustomDraftTitle] = useState('');

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
      setProposedSubtasks([]);
      setBreakdownThreadId(null);
      setBreakdownPrdSpec(null);
      setShowPrdSpec(false);
      setBreakdownComplete(false);
      setCustomDraftTitle('');
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
    if (!window.confirm(`Are you sure you want to delete ${issue.identifier}: "${issue.title}"?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const ok = await api.deleteIssue(issue.id, false);
      if (ok) {
        window.dispatchEvent(new CustomEvent('issueDeleted', { detail: issue.id }));
        onClose();
      }
    } catch (err) {
      console.error('Failed to delete issue', err);
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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const added = await api.addComment(issue.id, newComment);
    if (added) {
      setComments((prev) => [...prev, added]);
    }
    setNewComment('');
  };

  // Run LangGraph Spec Writer & Subtask Breakdown
  const handleStartAIBreakdown = async () => {
    setIsBreakingDown(true);
    setActiveTab('ai_breakdown');
    setBreakdownComplete(false);

    try {
      const res = await api.startBreakdown(issue.id);
      if (res?.thread_id) {
        setBreakdownThreadId(res.thread_id);
      }
      if (res?.prdspec) {
        setBreakdownPrdSpec(res.prdspec);
      }
      if (res?.proposed_subtasks && res.proposed_subtasks.length > 0) {
        setProposedSubtasks(
          res.proposed_subtasks.map((p: any) => ({
            title: typeof p === 'string' ? p : p.title || 'Task',
            description: p.description || '',
            estimate: p.estimate ?? 3,
            priority: (p.priority || 'medium') as IssuePriority,
          }))
        );
      } else if (res?.proposed_tasks && res.proposed_tasks.length > 0) {
        setProposedSubtasks(
          res.proposed_tasks.map((p: any) => ({
            title: typeof p === 'string' ? p : p.title || 'Task',
            description: p.description || '',
            estimate: p.estimate ?? 3,
            priority: (p.priority || 'medium') as IssuePriority,
          }))
        );
      } else {
        setProposedSubtasks([
          {
            title: `Configure backend endpoints for ${issue.identifier}`,
            description: 'Set up routes, validation schemas, and database queries.',
            priority: 'high',
          },
          {
            title: `Implement automated integration tests`,
            description: 'Write test cases verifying positive and error conditions.',
            priority: 'medium',
          },
          {
            title: `Add client UI updates and error boundaries`,
            description: 'Wire frontend forms, optimistic mutations, and alert toasts.',
            priority: 'medium',
          },
        ]);
      }
    } catch {
      setProposedSubtasks([
        {
          title: `Technical implementation for ${issue.identifier}`,
          priority: 'medium',
        },
      ]);
    } finally {
      setIsBreakingDown(false);
    }
  };

  const updateSubtaskTitle = (index: number, title: string) => {
    setProposedSubtasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, title } : t))
    );
  };

  const updateSubtaskPriority = (index: number, priority: IssuePriority) => {
    setProposedSubtasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, priority } : t))
    );
  };

  const removeProposedSubtask = (index: number) => {
    setProposedSubtasks((prev) => prev.filter((_, i) => i !== index));
  };

  const addCustomProposedSubtask = () => {
    if (!customDraftTitle.trim()) return;
    setProposedSubtasks((prev) => [
      ...prev,
      {
        title: customDraftTitle.trim(),
        priority: 'medium',
      },
    ]);
    setCustomDraftTitle('');
  };

  const handleApproveSubtasks = async () => {
    if (proposedSubtasks.length === 0) return;
    setBreakdownComplete(true);

    const existingTitles = new Set((issue.subtasks || []).map((s) => s.title.toLowerCase().trim()));
    const createdSubtasks: Issue[] = [];

    const formattedPayload = proposedSubtasks.map((p) => ({
      title: p.title,
      description: p.description || '',
      priority: p.priority || 'medium',
    }));

    if (breakdownThreadId) {
      const persisted: any = await api.resumeBreakdown(breakdownThreadId, formattedPayload);
      const createdIds: string[] = persisted?.created_subtask_ids || [];

      proposedSubtasks.forEach((task, idx) => {
        if (existingTitles.has(task.title.toLowerCase().trim())) {
          return;
        }
        existingTitles.add(task.title.toLowerCase().trim());
        const subIndex = (issue.subtasks?.length || 0) + createdSubtasks.length + 1;
        const subIssue: Issue = {
          id: createdIds[idx] || `iss_sub_${Date.now()}_${idx}`,
          organization_id: issue.organization_id,
          team_id: issue.team_id,
          number: (issue.number || 100) + subIndex,
          identifier: `${issue.identifier}-sub${subIndex}`,
          title: task.title,
          priority: task.priority || 'medium',
          state_id: activeStates[0]?.id || issue.state_id,
          state: activeStates[0] || issue.state,
          creator_id: issue.creator_id,
          parent_id: issue.id,
          sort_order: `${subIndex}|sub:`,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        createdSubtasks.push(subIssue);
        window.dispatchEvent(new CustomEvent('issueCreated', { detail: subIssue }));
      });
    } else {
      proposedSubtasks.forEach((task, idx) => {
        if (existingTitles.has(task.title.toLowerCase().trim())) {
          return;
        }
        existingTitles.add(task.title.toLowerCase().trim());
        const subIndex = (issue.subtasks?.length || 0) + createdSubtasks.length + 1;
        const subIssue: Issue = {
          id: `iss_sub_${Date.now()}_${idx}`,
          organization_id: issue.organization_id,
          team_id: issue.team_id,
          number: (issue.number || 100) + subIndex,
          identifier: `${issue.identifier}-sub${subIndex}`,
          title: task.title,
          priority: task.priority || 'medium',
          state_id: activeStates[0]?.id || issue.state_id,
          state: activeStates[0] || issue.state,
          creator_id: issue.creator_id,
          parent_id: issue.id,
          sort_order: `${subIndex}|sub:`,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        createdSubtasks.push(subIssue);
        window.dispatchEvent(new CustomEvent('issueCreated', { detail: subIssue }));
      });
    }

    if (createdSubtasks.length > 0) {
      const updated = {
        ...issue,
        subtasks: [...(issue.subtasks || []), ...createdSubtasks],
      };
      onUpdateIssue(updated);
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
              onClick={handleStartAIBreakdown}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
              <span>AI Spec Breakdown</span>
            </button>
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
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Description
              </h3>
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
                  <select
                    value={newSubtaskPriority}
                    onChange={(e) => setNewSubtaskPriority(e.target.value as IssuePriority)}
                    className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-700 cursor-pointer"
                  >
                    <option value="none">Priority: None</option>
                    <option value="low">Priority: Low</option>
                    <option value="medium">Priority: Medium</option>
                    <option value="high">Priority: High</option>
                    <option value="urgent">Priority: Urgent</option>
                  </select>
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
                  No sub-tasks yet. Use "+ Add sub-task" above or click "AI Spec Breakdown".
                </div>
              )}
            </div>

            {/* Tabs: Comments vs Activity vs AI Breakdown */}
            <div className="border-t border-zinc-800 pt-4 space-y-4">
              <div className="flex items-center gap-4 border-b border-zinc-800 pb-2 text-xs font-medium">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`flex items-center gap-1.5 pb-2 -mb-2 cursor-pointer ${
                    activeTab === 'comments'
                      ? 'text-white border-b-2 border-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Comments ({comments.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('attachments')}
                  className={`flex items-center gap-1.5 pb-2 -mb-2 cursor-pointer ${
                    activeTab === 'attachments'
                      ? 'text-white border-b-2 border-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attachments ({attachments.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`flex items-center gap-1.5 pb-2 -mb-2 cursor-pointer ${
                    activeTab === 'activity'
                      ? 'text-white border-b-2 border-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Activity Logs</span>
                </button>
                <button
                  onClick={() => setActiveTab('ai_breakdown')}
                  className={`flex items-center gap-1.5 pb-2 -mb-2 cursor-pointer ${
                    activeTab === 'ai_breakdown'
                      ? 'text-white border-b-2 border-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                  <span>AI Breakdown Gate</span>
                </button>
              </div>

              {activeTab === 'comments' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {comments.map((cmt) => (
                      <div key={cmt.id} className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{cmt.user?.name || 'User'}</span>
                            <span className="text-zinc-500">{new Date(cmt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">{cmt.body_text}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <div className="text-xs text-zinc-500 py-3">No comments yet.</div>
                    )}
                  </div>

                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Leave a comment..."
                      className="flex-1 bg-zinc-900 text-xs text-white placeholder-zinc-500 px-3.5 py-2 rounded border border-zinc-800 focus:border-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim()}
                      className="px-4 py-2 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-30 transition-colors shadow-xs cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-2 text-xs">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{log.actor?.name || 'User'}</span>
                        <span className="text-zinc-400 font-mono text-[11px]">{log.action}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                  {activityLogs.length === 0 && (
                    <div className="text-xs text-zinc-500 py-3">No activity logs recorded.</div>
                  )}
                </div>
              )}

              {activeTab === 'ai_breakdown' && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4 font-sans">
                  {/* Review Gate Header */}
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Human-in-the-Loop Review Gate</span>
                      <span className="text-[10px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800 font-mono">
                        {proposedSubtasks.length} {proposedSubtasks.length === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                    {isBreakingDown ? (
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                        <span>Decomposing...</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleStartAIBreakdown}
                        className="text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        Re-generate
                      </button>
                    )}
                  </div>

                  {/* PRD Spec Collapsible */}
                  {breakdownPrdSpec && (
                    <div className="rounded-lg border border-zinc-800/80 bg-black/60 overflow-hidden">
                      <button
                        onClick={() => setShowPrdSpec(!showPrdSpec)}
                        className="w-full px-3.5 py-2 flex items-center justify-between text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-amber-400/80" />
                          <span className="font-medium">Technical Specification (PRD)</span>
                        </div>
                        {showPrdSpec ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {showPrdSpec && (
                        <div className="px-3.5 py-3 border-t border-zinc-800/60 bg-zinc-950 text-xs text-zinc-300 font-mono whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                          {breakdownPrdSpec}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interactive Subtask Review Gate */}
                  {proposedSubtasks.length > 0 && !breakdownComplete && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>Review and customize proposed subtasks before batch persisting:</span>
                      </div>

                      <div className="space-y-2">
                        {proposedSubtasks.map((task, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-[10px] text-zinc-500 font-mono w-4 shrink-0 text-center">
                                {idx + 1}.
                              </span>
                              <input
                                type="text"
                                value={task.title}
                                onChange={(e) => updateSubtaskTitle(idx, e.target.value)}
                                placeholder="Subtask title"
                                className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-b focus:border-white px-1 py-0.5"
                              />
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto pl-6 sm:pl-0">

                              {/* Priority selector */}
                              <select
                                value={task.priority ?? 'medium'}
                                onChange={(e) => updateSubtaskPriority(idx, e.target.value as IssuePriority)}
                                className="bg-zinc-800 text-[11px] text-zinc-300 rounded px-2 py-1 border border-zinc-700 focus:outline-none cursor-pointer capitalize"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                              </select>

                              {/* Remove task */}
                              <button
                                onClick={() => removeProposedSubtask(idx)}
                                title="Remove subtask"
                                className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add Custom Subtask Inline */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={customDraftTitle}
                          onChange={(e) => setCustomDraftTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addCustomProposedSubtask()}
                          placeholder="+ Add custom subtask to breakdown..."
                          className="flex-1 bg-zinc-900/40 text-xs text-white placeholder-zinc-500 px-3 py-1.5 rounded-lg border border-dashed border-zinc-800 focus:border-white focus:outline-none"
                        />
                        <button
                          onClick={addCustomProposedSubtask}
                          disabled={!customDraftTitle.trim()}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 transition-colors cursor-pointer shrink-0"
                        >
                          Add
                        </button>
                      </div>

                      {/* Approval CTA */}
                      <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-500">
                          Resumes LangGraph execution to batch create issues
                        </span>
                        <button
                          onClick={handleApproveSubtasks}
                          className="px-4 py-2 rounded-lg text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                          <span>Approve & Batch Persist ({proposedSubtasks.length})</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {breakdownComplete && (
                    <div className="p-4 bg-zinc-900/60 border border-emerald-900/50 rounded-xl text-xs text-white space-y-2 animate-fade-in">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Subtasks Approved & Persisted</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Child subtasks have been created and linked to {issue.identifier}. You can view them in the subtasks checklist above.
                      </p>
                      <button
                        onClick={handleStartAIBreakdown}
                        className="mt-1 text-xs text-zinc-300 hover:text-white underline cursor-pointer"
                      >
                        Start another breakdown
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'attachments' && (
                <div className="space-y-4">
                  {/* Upload Box / Dropzone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-zinc-700 hover:border-white rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-zinc-950/60 group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {isUploading ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-300">
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Uploading attachment...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                        <div className="text-center">
                          <p className="text-xs font-medium text-white">Click to upload file</p>
                          <p className="text-[11px] text-zinc-500">Max size 50MB (images, logs, archives, documents)</p>
                        </div>
                      </>
                    )}
                  </div>

                  {uploadError && (
                    <div className="p-2.5 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-300">
                      {uploadError}
                    </div>
                  )}

                  {/* Attachments List */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Files ({attachments.length})
                    </h4>
                    {attachments.length > 0 ? (
                      <div className="space-y-2">
                        {attachments.map((att) => (
                          <div
                            key={att.id}
                            className="p-3 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium text-white truncate text-xs">{att.file_name}</p>
                                <p className="text-[11px] text-zinc-500 font-mono">
                                  {formatFileSize(att.file_size)} • {new Date(att.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={
                                  att.file_url ||
                                  `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'}/storage/v1/object/public/attachments/${att.storage_path}`
                                }
                                download={att.file_name}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Download attachment"
                                className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-900 transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => handleDeleteAttachment(att.id)}
                                title="Delete attachment"
                                className="p-1.5 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-900 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center rounded border border-dashed border-zinc-900 text-xs text-zinc-500">
                        No attachments uploaded yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
              <select
                value={issue.priority}
                onChange={(e) => handlePriorityChange(e.target.value as IssuePriority)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
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
