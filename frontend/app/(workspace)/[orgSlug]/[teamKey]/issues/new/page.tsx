/**
 * @related-files:
 * - frontend/components/issues/CreateIssueModal.tsx
 * - frontend/app/(workspace)/[orgSlug]/[teamKey]/issues/page.tsx
 * - frontend/app/(workspace)/[orgSlug]/[teamKey]/issues/[issueIdentifier]/page.tsx
 * - frontend/app/(workspace)/[orgSlug]/[teamKey]/layout.tsx
 * - frontend/types/index.ts
 * - frontend/lib/WorkspaceContext.tsx
 * - frontend/lib/api.ts
 */

'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Tag,
  User as UserIcon,
  CheckCircle2,
} from 'lucide-react';
import { IssuePriority, Issue, WorkflowState, User, Label } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

function CreateIssueForm() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';
  const queryStateId = searchParams.get('stateId') || '';
  const queryParentId = searchParams.get('parentId') || '';

  const { teams: workspaceTeams, currentTeam, workspaceUsers } = useWorkspace();

  const [selectedTeamId, setSelectedTeamId] = useState<string>(currentTeam?.id || '');
  const [parentId, setParentId] = useState<string>(queryParentId);
  const [teamWorkflowStates, setTeamWorkflowStates] = useState<WorkflowState[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('none');
  const [stateId, setStateId] = useState(queryStateId);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [estimate, setEstimate] = useState<number>(2);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sync selectedTeamId when currentTeam becomes available
  useEffect(() => {
    if (currentTeam?.id && !selectedTeamId) {
      setSelectedTeamId(currentTeam.id);
    }
  }, [currentTeam?.id, selectedTeamId]);

  // Load workflow states, members, and labels for the selected team
  useEffect(() => {
    const targetTeamId = selectedTeamId || currentTeam?.id;
    if (!targetTeamId) return;

    let isMounted = true;
    setIsLoadingStates(true);

    Promise.all([
      api.getWorkflowStates(targetTeamId),
      api.getTeamMembers(targetTeamId),
    ])
      .then(([fetchedStates, fetchedMembers]) => {
        if (!isMounted) return;
        setTeamWorkflowStates(fetchedStates || []);

        // Pick state: query param if matches team, or default, or first
        if (queryStateId && fetchedStates.some((s) => s.id === queryStateId)) {
          setStateId(queryStateId);
        } else {
          const defaultState = fetchedStates.find((s) => s.is_default) || fetchedStates[0];
          if (defaultState) {
            setStateId(defaultState.id);
          }
        }

        if (fetchedMembers && fetchedMembers.length > 0) {
          setTeamMembers(
            fetchedMembers.map((tm: any) => ({
              id: tm.user_id || tm.id,
              name: tm.user?.name || tm.user?.email || 'Member',
              email: tm.user?.email || '',
            }))
          );
        } else if (workspaceUsers && workspaceUsers.length > 0) {
          setTeamMembers(
            workspaceUsers.map((m) => m.user).filter((u): u is User => Boolean(u))
          );
        }
      })
      .catch((err) => {
        console.error('Error fetching team dependencies for new issue', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingStates(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTeamId, currentTeam?.id, queryStateId, workspaceUsers]);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    const resolvedTeamId = selectedTeamId || currentTeam?.id;
    if (!resolvedTeamId) {
      setSubmitError('Unable to identify team. Please verify team selection.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const targetState =
      stateId ||
      teamWorkflowStates.find((s) => s.is_default)?.id ||
      teamWorkflowStates[0]?.id;

    if (!targetState) {
      setSubmitError('Team workflow states are not configured.');
      setIsSubmitting(false);
      return;
    }

    try {
      const created = await api.createIssue({
        team_id: resolvedTeamId,
        source_team_id: currentTeam?.id || undefined,
        parent_id: parentId || undefined,
        title: title.trim(),
        description_text: description.trim(),
        priority,
        state_id: targetState,
        assignee_id: assigneeId || undefined,
        estimate,
        labels: availableLabels.filter((l) => selectedLabels.includes(l.id)),
      });

      if (created) {
        // Dispatch event for any active listeners (e.g. board/realtime)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('issueCreated', { detail: created }));
        }

        // Navigate to the newly created issue URL
        const destTeam =
          workspaceTeams.find((t) => t.id === resolvedTeamId)?.key?.toLowerCase() ||
          teamKey.toLowerCase();
        router.push(`/${orgSlug}/${destTeam}/issues/${created.identifier}`);
      } else {
        router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues`);
      }
    } catch (err: any) {
      console.error('Failed to create issue', err);
      setSubmitError(err?.message || 'Failed to create issue. Please check fields.');
      setIsSubmitting(false);
    }
  };

  const selectedTeamMeta =
    workspaceTeams.find((t) => t.id === selectedTeamId) || currentTeam;

  return (
    <div className="flex flex-col flex-1 h-full overflow-y-auto bg-black font-sans">
      {/* Header Bar */}
      <div className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors cursor-pointer"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-zinc-900 text-zinc-200 border border-zinc-800">
              {selectedTeamMeta?.key || teamKey}
            </span>
            <span className="text-zinc-600">•</span>
            <h1 className="text-sm font-semibold text-zinc-100">Create New Issue</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-issue-form"
            disabled={isSubmitting || !title.trim()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Issue</span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8">
        <form id="create-issue-form" onSubmit={handleSubmit} className="space-y-6">
          {submitError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Destination Team Selector */}
          {workspaceTeams.length > 1 && (
            <div className="flex items-center gap-2 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
              <span className="text-xs text-zinc-400 font-medium">Team Destination:</span>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="text-xs font-semibold text-white bg-zinc-900 px-2.5 py-1 rounded border border-zinc-700 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {workspaceTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.key} • {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Issue Title Input */}
          <div className="space-y-1">
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              className="w-full text-lg md:text-xl font-semibold bg-transparent border-0 border-b border-zinc-800 text-white placeholder-zinc-600 pb-2 focus:ring-0 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Metadata Controls Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80">
            {/* Status Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Status
              </label>
              {isLoadingStates ? (
                <div className="h-7 bg-zinc-900 rounded animate-pulse" />
              ) : (
                <select
                  value={stateId}
                  onChange={(e) => setStateId(e.target.value)}
                  className="w-full text-xs bg-zinc-900 text-zinc-200 px-2.5 py-1.5 rounded-md border border-zinc-700/80 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {teamWorkflowStates.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.category})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Priority Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className="w-full text-xs bg-zinc-900 text-zinc-200 px-2.5 py-1.5 rounded-md border border-zinc-700/80 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="none">None</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Assigned to Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Assigned to
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full text-xs bg-zinc-900 text-zinc-200 px-2.5 py-1.5 rounded-md border border-zinc-700/80 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Estimate Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Estimate
              </label>
              <select
                value={estimate}
                onChange={(e) => setEstimate(Number(e.target.value))}
                className="w-full text-xs bg-zinc-900 text-zinc-200 px-2.5 py-1.5 rounded-md border border-zinc-700/80 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value={1}>1 point</option>
                <option value={2}>2 points</option>
                <option value={3}>3 points</option>
                <option value={5}>5 points</option>
                <option value={8}>8 points</option>
              </select>
            </div>
          </div>

          {/* Issue Description Area */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Description
            </label>
            <textarea
              rows={12}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description... (Markdown supported)"
              className="w-full text-sm bg-zinc-950 text-zinc-200 p-4 rounded-xl border border-zinc-800 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-y font-sans transition-colors"
            />
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewIssuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1 h-full items-center justify-center bg-black text-xs text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400 mb-2" />
          <span>Loading issue form...</span>
        </div>
      }
    >
      <CreateIssueForm />
    </Suspense>
  );
}
