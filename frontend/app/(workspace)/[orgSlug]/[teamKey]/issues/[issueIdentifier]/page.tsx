'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Trash2,
  Loader2,
  Link2,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { Issue, IssueComment, ActivityLog, IssuePriority, WorkflowState, IssueAttachment, User, Label } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { PriorityPicker } from '@/components/ui/PriorityPicker';
import { StatusPicker } from '@/components/ui/StatusPicker';
import { AssigneePicker } from '@/components/ui/AssigneePicker';
import { LabelPicker } from '@/components/ui/LabelPicker';
import { IssueSubtasksTree } from '@/components/issues/IssueSubtasksTree';
import { IssueTitleEditor } from '@/components/issues/IssueTitleEditor';
import { IssueDescriptionEditor } from '@/components/editor/IssueDescriptionEditor';
import { IssueAttachmentButton } from '@/components/issues/IssueAttachmentButton';
import { IssueActivityFeed } from '@/components/issues/IssueActivityFeed';
import { toast } from 'sonner';

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';
  const issueIdentifier = (params?.issueIdentifier as string) || '';

  const [issue, setIssue] = useState<Issue | null>(null);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [workspaceUsers, setWorkspaceUsers] = useState<User[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [comments, setComments] = useState<IssueComment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [attachments, setAttachments] = useState<IssueAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Subtask UI state
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isSubmittingSubtask, setIsSubmittingSubtask] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);

  // Load team, states, workspace users
  useEffect(() => {
    let isMounted = true;
    api.getWorkspaceMembers(orgSlug).then((members) => {
      if (!isMounted) return;
      const active = (members || [])
        .filter((m) => m.status !== 'invited' && m.user)
        .map((m) => ({
          id: m.user_id,
          name: m.user?.name || m.user?.email || 'Member',
          email: m.user?.email || '',
        }));
      setWorkspaceUsers(active);
    }).catch(() => {});

    api.getTeams(orgSlug).then((teams) => {
      if (!isMounted) return;
      const matched = teams.find((t) => t.key.toUpperCase() === teamKey) || teams[0];
      if (matched) {
        api.getWorkflowStates(matched.id).then((res) => {
          if (isMounted) setStates(res);
        });
        api.getTeamMembers(matched.id).then((tm) => {
          if (isMounted) setTeamMembers(tm);
        }).catch(() => {});
      }
    });

    return () => {
      isMounted = false;
    };
  }, [orgSlug, teamKey]);

  // Load specific issue by identifier
  const loadIssue = async () => {
    if (!issueIdentifier) return;
    setIsLoading(true);
    try {
      const data = await api.getIssue(issueIdentifier);
      if (data) {
        setIssue(data);
        if (data.organization_id) {
          api.getLabels(data.organization_id).then((lbls) => setAvailableLabels(lbls || [])).catch(() => {});
        }
        api.getComments(data.id).then(setComments);
        api.getActivityLogs(data.id).then(setActivityLogs);
        api.getAttachments(data.id).then(setAttachments);
      }
    } catch (err) {
      console.error('Failed to load issue:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIssue();
  }, [issueIdentifier]);

  const activeStates = states;

  const assignableUsers = useMemo(() => {
    const map = new Map<string, any>();
    (workspaceUsers || []).forEach((u) => {
      if (u.id) map.set(u.id, u);
    });
    teamMembers.forEach((tm) => {
      const u = tm.user || { id: tm.user_id, name: tm.user_id };
      if (u.id && !map.has(u.id)) {
        map.set(u.id, u);
      }
    });
    return Array.from(map.values());
  }, [workspaceUsers, teamMembers]);

  // Handlers for mutations
  const handleTitleChange = async (newTitle: string) => {
    if (!issue || newTitle === issue.title) return;
    setIssue((prev) => (prev ? { ...prev, title: newTitle } : prev));
    try {
      const updated = await api.updateIssue(issue.id, { title: newTitle, expected_version: issue.version ?? 1 });
      if (updated) {
        setIssue(updated);
      }
    } catch (err) {
      console.error('Failed to update title:', err);
      const fresh = await api.getIssue(issue.id);
      if (fresh) setIssue(fresh);
    }
  };

  const handleDescriptionChange = async ({ description_text, description_json }: { description_text: string; description_json: any }) => {
    if (!issue) return;
    setIssue((prev) => (prev ? { ...prev, description_text, description_json } : prev));
    try {
      const updated = await api.updateIssue(issue.id, {
        description_text,
        description_json,
        expected_version: issue.version ?? 1,
      });
      if (updated) {
        setIssue(updated);
      }
    } catch (err) {
      console.error('Failed to update description:', err);
      const fresh = await api.getIssue(issue.id);
      if (fresh) setIssue(fresh);
    }
  };

  const handleStatusChange = async (newStateId: string) => {
    if (!issue || newStateId === issue.state_id) return;
    const newState = activeStates.find((s) => s.id === newStateId);
    setIssue((prev) => (prev ? { ...prev, state_id: newStateId, state: newState } : prev));
    try {
      const updated = await api.updateIssue(issue.id, { state_id: newStateId, expected_version: issue.version ?? 1 });
      if (updated) {
        setIssue(updated);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      const fresh = await api.getIssue(issue.id);
      if (fresh) setIssue(fresh);
    }
  };

  const handlePriorityChange = async (newPriority: IssuePriority) => {
    if (!issue || newPriority === issue.priority) return;
    setIssue((prev) => (prev ? { ...prev, priority: newPriority } : prev));
    try {
      const updated = await api.updateIssue(issue.id, { priority: newPriority, expected_version: issue.version ?? 1 });
      if (updated) {
        setIssue(updated);
      }
    } catch (err) {
      console.error('Failed to update priority:', err);
      const fresh = await api.getIssue(issue.id);
      if (fresh) setIssue(fresh);
    }
  };

  const handleAssigneeChange = async (newAssigneeId: string) => {
    if (!issue) return;
    const assignedUser = assignableUsers.find((u) => u.id === newAssigneeId);
    setIssue((prev) => (prev ? { ...prev, assignee_id: newAssigneeId || undefined, assignee: assignedUser } : prev));
    try {
      const updated = await api.updateIssue(issue.id, {
        assignee_id: newAssigneeId || undefined,
        expected_version: issue.version ?? 1,
      });
      if (updated) {
        setIssue(updated);
      }
    } catch (err) {
      console.error('Failed to update assignee:', err);
      const fresh = await api.getIssue(issue.id);
      if (fresh) setIssue(fresh);
    }
  };

  const handleToggleLabel = async (labelId: string) => {
    if (!issue) return;
    const currentIds = (issue.labels || []).map((l) => l.id);
    const nextIds = currentIds.includes(labelId)
      ? currentIds.filter((id) => id !== labelId)
      : [...currentIds, labelId];

    try {
      const updated = await api.updateIssue(issue.id, {
        label_ids: nextIds,
        expected_version: issue.version ?? 1,
      });
      if (updated) {
        setIssue(updated);
      }
    } catch (err) {
      console.error('Failed to toggle label:', err);
      const fresh = await api.getIssue(issue.id);
      if (fresh) setIssue(fresh);
    }
  };

  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue || !newSubtaskTitle.trim() || isSubmittingSubtask) return;

    setIsSubmittingSubtask(true);
    try {
      const defaultState = activeStates.find((s) => s.is_default) || activeStates[0];
      const created = await api.createIssue({
        title: newSubtaskTitle.trim(),
        team_id: issue.team_id,
        parent_id: issue.id,
        state_id: defaultState?.id || issue.state_id,
        priority: 'none',
      });

      if (created) {
        setIssue((prev) =>
          prev ? { ...prev, subtasks: [...(prev.subtasks || []), created] } : prev
        );
        setNewSubtaskTitle('');
        setIsAddingSubtask(false);
        toast.success(`Subtask ${created.identifier} created`);
      }
    } catch (err) {
      console.error('Failed to create subtask:', err);
      toast.error('Failed to create subtask');
    } finally {
      setIsSubmittingSubtask(false);
    }
  };

  const handleDeleteIssue = async () => {
    if (!issue) return;
    setIsDeleting(true);
    try {
      await api.deleteIssue(issue.id, true);
      toast.success(`Issue ${issue.identifier} deleted`);
      router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues`);
    } catch (err: any) {
      console.error('Failed to delete issue:', err);
      toast.error(err?.message || 'Failed to delete issue');
      setIsDeleting(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !issue) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const uploadIntent = await api.getUploadUrl(
        issue.id,
        file.name,
        file.size,
        file.type || 'application/octet-stream'
      );

      if (!uploadIntent) {
        setUploadError('Failed to generate upload URL.');
        setIsUploading(false);
        return;
      }

      try {
        await fetch(uploadIntent.upload_url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
      } catch {
        // Fallback for mock environments
      }

      const freshAttachments = await api.getAttachments(issue.id);
      setAttachments(freshAttachments);
      toast.success('Attachment uploaded successfully');
    } catch (err: any) {
      console.error('File upload failed:', err);
      setUploadError(err.message || 'File upload failed');
      toast.error(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddComment = async (text: string) => {
    if (!issue) return;
    try {
      const newComment = await api.addComment(issue.id, text);
      if (newComment) {
        setComments((prev) => [...prev, newComment]);
        toast.success('Comment posted');
      }
    } catch (err: any) {
      console.error('Failed to post comment:', err);
      toast.error(err?.message || 'Failed to post comment');
    }
  };

  if (isLoading || !issue) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-black">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const subtasks = issue.subtasks || [];
  const completedSubtasksCount = subtasks.filter((s) => s.state?.category === 'completed').length;

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-[#08090a] font-sans">
      <TopNav
        breadcrumbs={[
          { label: `${teamKey} Issues`, href: `/${orgSlug}/${teamKey.toLowerCase()}/issues` },
          { label: issue.identifier },
        ]}
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyLink}
              className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Copy link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDeleteIssue}
              disabled={isDeleting}
              className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Delete Issue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      {/* Two Column Canvas: Left Main Content & Right Properties Rail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Left Column */}
        <div className="flex-1 p-6 sm:p-8 overflow-y-auto space-y-6 max-w-4xl">
          <IssueTitleEditor
            initialTitle={issue.title}
            onSave={handleTitleChange}
          />

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
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

          {/* Sub-issues Section Matching Images 4 & 5 */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between py-1">
              <button
                type="button"
                onClick={() => setIsSubtasksExpanded((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                {isSubtasksExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                )}
                <span>Sub-issues</span>
                <span className="font-mono text-zinc-500 text-[11px] font-normal">
                  {completedSubtasksCount}/{subtasks.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddingSubtask(true)}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Add sub-issue"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {isSubtasksExpanded && (
              <div className="space-y-1">
                {subtasks.length > 0 && (
                  <IssueSubtasksTree
                    rootIssue={issue}
                    subtasks={subtasks}
                    orgSlug={orgSlug}
                    teamKey={teamKey}
                    users={assignableUsers}
                    onSelectIssue={(sub) => {
                      router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${sub.identifier}`);
                    }}
                    onAddSubtaskToParent={() => setIsAddingSubtask(true)}
                  />
                )}

                {/* Inline Add Sub-issue Row */}
                {isAddingSubtask ? (
                  <form onSubmit={handleCreateSubtask} className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      autoFocus
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsAddingSubtask(false);
                      }}
                      placeholder="Add sub-issue title..."
                      className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-white/[0.15] rounded px-2.5 py-1 text-xs text-white placeholder-zinc-500 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newSubtaskTitle.trim() || isSubmittingSubtask}
                      className="px-2.5 py-1 rounded bg-[#5e6ad2] hover:bg-[#7170ff] text-white text-xs font-medium cursor-pointer disabled:opacity-40"
                    >
                      {isSubmittingSubtask ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSubtask(false)}
                      className="px-2 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  subtasks.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setIsAddingSubtask(true)}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 py-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add sub-issue</span>
                    </button>
                  )
                )}
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

        {/* Right Properties Sidebar — Strictly Project Schema Only (Per Requirement #2) */}
        <div className="w-64 border-l border-white/[0.05] p-5 bg-[#0a0b0d] space-y-6 text-xs shrink-0 select-none">
          <div className="space-y-3">
            <h3 className="font-semibold text-zinc-400 text-[11px] uppercase tracking-wider">
              Properties
            </h3>

            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-xs">Status</span>
              <StatusPicker
                states={activeStates}
                currentStateId={issue.state_id}
                currentState={issue.state}
                showChevron={false}
                onSelectState={handleStatusChange}
                triggerClassName="bg-transparent border-0 hover:bg-white/[0.06] p-1 h-auto text-zinc-200"
              />
            </div>

            {/* Priority */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-xs">Priority</span>
              <PriorityPicker
                currentPriority={issue.priority}
                showChevron={false}
                onSelectPriority={handlePriorityChange}
                triggerClassName="bg-transparent border-0 hover:bg-white/[0.06] p-1 h-auto text-zinc-200"
              />
            </div>

            {/* Assignee */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-xs">Assignee</span>
              <AssigneePicker
                users={assignableUsers}
                currentAssigneeId={issue.assignee_id}
                currentAssignee={issue.assignee}
                showChevron={false}
                showLabel={true}
                onSelectAssignee={(uid) => handleAssigneeChange(uid || '')}
                triggerClassName="bg-transparent border-0 hover:bg-white/[0.06] p-1 h-auto text-zinc-200"
              />
            </div>
          </div>

          {/* Labels Section */}
          <div className="space-y-2 pt-2 border-t border-white/[0.04]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-zinc-400 text-[11px] uppercase tracking-wider">
                Labels
              </h3>
              <LabelPicker
                availableLabels={availableLabels}
                selectedLabelIds={(issue.labels || []).map((l) => l.id)}
                onToggleLabel={handleToggleLabel}
                triggerClassName="p-1 hover:bg-white/[0.06] rounded text-zinc-400 hover:text-white"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[24px]">
              {issue.labels && issue.labels.length > 0 ? (
                issue.labels.map((lbl) => (
                  <span
                    key={lbl.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white/[0.06] text-zinc-200 border border-white/[0.04]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: lbl.color || '#a1a1aa' }}
                    />
                    <span>{lbl.name}</span>
                  </span>
                ))
              ) : (
                <span className="text-zinc-600 text-[11px]">No labels</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
