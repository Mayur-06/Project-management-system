'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trash2,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { Issue, IssueComment, ActivityLog, IssuePriority, WorkflowState, IssueAttachment, User, Label } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { PriorityPicker } from '@/components/ui/PriorityPicker';
import { StateBadge } from '@/components/ui/StateBadge';
import { StatusPicker } from '@/components/ui/StatusPicker';
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

  // Manual subtask creation state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskPriority, setNewSubtaskPriority] = useState<IssuePriority>('none');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState<string>('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
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

  const assignableUsers = React.useMemo(() => {
    const map = new Map<string, any>();
    (workspaceUsers || []).forEach((u) => {
      if (u.id) map.set(u.id, u);
    });
    teamMembers.forEach((tm) => {
      const u = tm.user || { id: tm.user_id, name: tm.user_id };
      if (u.id && !map.has(u.id)) {
        map.set(u.id, { id: u.id, name: u.name || u.email, email: u.email });
      }
    });
    return Array.from(map.values());
  }, [workspaceUsers, teamMembers]);

  const handleStatusChange = async (stateId: string) => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(issue.id, {
        state_id: stateId,
        expected_version: issue.version,
      });
      if (updated) {
        setIssue(updated);
        window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePriorityChange = async (priority: IssuePriority) => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(issue.id, {
        priority,
        expected_version: issue.version,
      });
      if (updated) {
        setIssue(updated);
        window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTitleChange = async (newTitle: string) => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(issue.id, {
        title: newTitle,
        expected_version: issue.version,
      });
      if (updated) {
        setIssue(updated);
        window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
        toast.success('Title updated');
      }
    } catch (err) {
      console.error('Failed to update title', err);
      toast.error('Failed to update title');
    }
  };

  const handleDescriptionChange = async (data: { description_text: string; description_json: any }) => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(issue.id, {
        description_text: data.description_text,
        description_json: data.description_json,
        expected_version: issue.version,
      });
      if (updated) {
        setIssue(updated);
        window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
      }
    } catch (err) {
      console.error('Failed to update description', err);
      toast.error('Failed to save description');
    }
  };

  const handleAssigneeChange = async (assigneeId: string) => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(issue.id, {
        assignee_id: assigneeId ? assigneeId : undefined,
        expected_version: issue.version,
      });
      if (updated) {
        setIssue(updated);
        window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue || !newSubtaskTitle.trim() || isAddingSubtask) return;
    setIsAddingSubtask(true);
    try {
      const created = await api.createSubtask(issue.id, {
        title: newSubtaskTitle.trim(),
        priority: newSubtaskPriority,
        assignee_id: newSubtaskAssigneeId || undefined,
      });
      if (created) {
        await loadIssue();
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
    if (!window.confirm(`Are you sure you want to delete ${issue.identifier}: "${issue.title}"?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const ok = await api.deleteIssue(issue.id, false);
      if (ok) {
        window.dispatchEvent(new CustomEvent('issueDeleted', { detail: issue.id }));
        router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues`);
      }
    } catch (err) {
      console.error('Failed to delete issue', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddComment = async (text: string) => {
    if (!issue || !text.trim()) return;

    try {
      const created = await api.addComment(issue.id, text.trim());
      if (created) {
        setComments((prev) => [...prev, created]);
        toast.success('Comment posted');
        api.getActivityLogs(issue.id).then(setActivityLogs);
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

      const ticket = await api.getUploadUrl(issue.id, file.name, file.size, file.type || 'application/octet-stream');

      if (!ticket) {
        throw new Error('Could not obtain direct upload credentials.');
      }

      try {
        await fetch(ticket.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });
      } catch {
        // Fallback for mock environments
      }

      const updatedList = await api.getAttachments(issue.id);
      setAttachments(updatedList);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload file.');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 h-full items-center justify-center bg-black text-xs text-zinc-500 font-sans">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400 mb-2" />
        <span>Loading {issueIdentifier}...</span>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex flex-col flex-1 h-full items-center justify-center bg-black text-xs text-zinc-400 font-sans space-y-3">
        <p>Issue {issueIdentifier} could not be found.</p>
        <Link
          href={`/${orgSlug}/${teamKey.toLowerCase()}/issues`}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Issues</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-black font-sans">
      <TopNav
        title={issue.identifier}
        subtitle={issue.title}
        breadcrumbs={['Workspace', teamKey || 'Team', 'Issues', issue.identifier]}
      />

      {/* Main Issue Header Bar */}
      <div className="px-6 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues`);
              }
            }}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-900 transition-colors mr-1 cursor-pointer"
            title="Back to all issues"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
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
        </div>
      </div>

      {/* Two Column Canvas: Left Main Content & Right Properties Rail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Left Column */}
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

            {/* Inline Add Sub-task form */}
            <form onSubmit={handleCreateSubtask} className="space-y-2 p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="+ Add sub-task title..."
                  className="flex-1 bg-zinc-900/60 border border-zinc-800 focus:border-zinc-700 rounded px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
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
                  orgSlug={orgSlug}
                  teamKey={teamKey}
                  users={assignableUsers}
                  onSelectIssue={(sub) => {
                    router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${sub.identifier}`);
                  }}
                  onAddSubtaskToParent={(parentId) => {
                    router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/new?parentId=${parentId}`);
                  }}
                />
              </div>
            ) : (
              <div className="p-3 text-center rounded border border-dashed border-zinc-900 text-xs text-zinc-500">
                No child sub-tasks yet.
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
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none"
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((m: any) => (
                <option key={m.id || m.user_id} value={m.user_id || m.id}>
                  {m.name || m.user?.name || m.user?.email || 'Member'}
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

          {/* Labels Manager */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">Labels</label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-900 border border-zinc-800 rounded min-h-[36px] items-center">
              {availableLabels.length === 0 ? (
                <span className="text-zinc-600 text-xs">No labels configured</span>
              ) : (
                availableLabels.map((lbl) => {
                  const currentLabelIds = (issue.labels || []).map((l) => l.id);
                  const isAttached = currentLabelIds.includes(lbl.id);
                  return (
                    <button
                      key={lbl.id}
                      type="button"
                      onClick={async () => {
                        const newIds = isAttached
                          ? currentLabelIds.filter((id) => id !== lbl.id)
                          : [...currentLabelIds, lbl.id];
                        const updated = await api.updateIssue(issue.id, {
                          label_ids: newIds,
                          expected_version: issue.version,
                        });
                        if (updated) {
                          setIssue(updated);
                          window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
                        }
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 cursor-pointer ${
                        isAttached
                          ? 'font-medium shadow-xs'
                          : 'opacity-40 hover:opacity-80 border-transparent bg-zinc-800/60 text-zinc-400'
                      }`}
                      style={
                        isAttached
                          ? {
                              backgroundColor: `${lbl.color}25`,
                              borderColor: lbl.color,
                              color: lbl.color,
                            }
                          : {}
                      }
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lbl.color }} />
                      <span>{lbl.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
