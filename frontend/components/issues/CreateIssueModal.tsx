'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
} from 'lucide-react';
import { IssuePriority, Issue, WorkflowState, User, Label, Cycle } from '@/types';
import { api } from '@/lib/api';

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
  initialStateId?: string;
  states?: WorkflowState[];
  users?: User[];
  labels?: Label[];
  cycles?: Cycle[];
  teamKey?: string;
  teamId?: string;
  teams?: { id: string; name: string; key: string }[];
}

export const CreateIssueModal: React.FC<CreateIssueModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialStateId = '',
  states = [],
  users = [],
  labels = [],
  cycles = [],
  teamKey = '',
  teamId,
  teams = [],
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teamId || '');
  const [teamWorkflowStates, setTeamWorkflowStates] = useState<WorkflowState[]>(states);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('none');
  const [stateId, setStateId] = useState(initialStateId);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [estimate, setEstimate] = useState<number>(2);
  const [cycleId, setCycleId] = useState<string>('');
  const [teamCycles, setTeamCycles] = useState<Cycle[]>(cycles);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [modalUsers, setModalUsers] = useState<User[]>(users);

  // Sync initial team
  useEffect(() => {
    if (teamId) {
      setSelectedTeamId(teamId);
    }
  }, [teamId, isOpen]);

  // When selectedTeamId changes, dynamically fetch that team's workflow states & members
  useEffect(() => {
    if (!isOpen || !selectedTeamId) return;

    if (selectedTeamId === teamId && states.length > 0) {
      setTeamWorkflowStates(states);
      return;
    }

    let isMounted = true;
    api.getWorkflowStates(selectedTeamId).then((res) => {
      if (isMounted && res && res.length > 0) {
        setTeamWorkflowStates(res);
      }
    }).catch(() => {});

    api.getTeamMembers(selectedTeamId).then((tms) => {
      if (isMounted && tms && tms.length > 0) {
        setModalUsers(
          tms.map((tm: any) => ({
            id: tm.user_id || tm.id,
            name: tm.user?.name || tm.user?.email || 'Member',
            email: tm.user?.email || '',
          }))
        );
      }
    }).catch(() => {});

    api.getCycles(selectedTeamId).then((cList) => {
      if (isMounted && cList) {
        setTeamCycles(cList.filter((c) => !c.completed_at));
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [selectedTeamId, teamId, isOpen, states]);

  const isCrossTeam = Boolean(teamId && selectedTeamId && teamId !== selectedTeamId);
  const targetTriageState = teamWorkflowStates.find((s) => s.category === 'triage');
  const activeStates = isCrossTeam && targetTriageState
    ? [targetTriageState]
    : teamWorkflowStates.filter((s) => s.category !== 'triage');

  useEffect(() => {
    if (users && users.length > 0 && selectedTeamId === teamId) {
      setModalUsers(users);
    }
  }, [users, selectedTeamId, teamId]);

  // Auto-route to triage state if cross-team; otherwise to default active state
  useEffect(() => {
    if (isCrossTeam && targetTriageState) {
      setStateId(targetTriageState.id);
    } else if (activeStates.length > 0) {
      const defaultState = activeStates.find((s) => s.is_default) || activeStates[0];
      setStateId(defaultState.id);
    }
  }, [isCrossTeam, targetTriageState, selectedTeamId]);

  // Real-time debounced duplicate check
  const [duplicateMatches, setDuplicateMatches] = useState<
    { id: string; title: string; similarity: number; identifier?: string }[]
  >([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (title.trim().length < 10) {
      setDuplicateMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      const res = await api.checkDuplicates(title);
      setDuplicateMatches(res?.duplicates || []);
      setIsCheckingDuplicates(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [title]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const resolvedTeamId = selectedTeamId || teamId || states[0]?.team_id;
      const targetState = isCrossTeam && targetTriageState ? targetTriageState.id : (stateId || activeStates[0]?.id);
      if (!targetState) {
        throw new Error('No workflow state available for selected team.');
      }
      const created = await api.createIssue({
        team_id: resolvedTeamId,
        source_team_id: teamId || undefined,
        title,
        description_text: description,
        priority,
        state_id: targetState,
        assignee_id: isCrossTeam ? undefined : (assigneeId || undefined),
        estimate,
        cycle_id: isCrossTeam ? undefined : (cycleId || undefined),
        labels: labels.filter((l) => selectedLabels.includes(l.id)),
      });
      if (created) {
        onCreated(created);
      }
      onClose();
      setTitle('');
      setDescription('');
    } catch (err: any) {
      console.error('Failed to create issue', err);
      setSubmitError(err?.message || 'Failed to create issue. Please check fields.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTeamMeta = teams.find((t) => t.id === selectedTeamId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="w-full max-w-2xl bg-black border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2">
            {/* Destination Team Selector */}
            {teams.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-400 font-medium">To Team:</span>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="text-xs font-semibold text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700 font-mono focus:outline-none focus:border-zinc-500 cursor-pointer"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.key} • {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              (selectedTeamMeta?.key || teamKey) && (
                <span className="text-xs font-semibold text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700 font-mono">
                  {selectedTeamMeta?.key || teamKey}
                </span>
              )
            )}
            <span className="text-zinc-600">•</span>
            <span className="text-xs text-zinc-400 font-medium">New Issue</span>

            {isCrossTeam && (
              <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded font-medium ml-1">
                Cross-team → Triage
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {submitError && (
            <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-xs text-red-200">
              {submitError}
            </div>
          )}
          <div>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              className="w-full bg-transparent text-base font-semibold text-white placeholder-zinc-500 focus:outline-none"
            />
          </div>

          {/* Real-time Semantic Duplicate Banner */}
          {duplicateMatches.length > 0 && (
            <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-2 animate-fade-in font-sans">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Potential Similar Issues Found ({duplicateMatches.length}):</span>
              </div>
              <div className="space-y-1 pl-1">
                {duplicateMatches.map((m) => (
                  <div
                    key={m.id}
                    className="text-xs text-zinc-300 flex items-center justify-between p-1 rounded bg-zinc-950/60 border border-zinc-800/80"
                  >
                    <div className="flex items-center gap-2 truncate max-w-[80%]">
                      {m.identifier && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-700 shrink-0">
                          {m.identifier}
                        </span>
                      )}
                      <span className="truncate">{m.title}</span>
                    </div>
                    <span className="text-[10px] text-amber-400 font-mono font-medium shrink-0">
                      {Math.round(m.similarity * 100)}% match
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              className="w-full bg-zinc-900 text-xs text-zinc-200 placeholder-zinc-500 p-3 rounded border border-zinc-800 focus:border-white focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Properties Selector Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2">
            {/* Status */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">Status</label>
              <select
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none"
              >
                {activeStates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none cursor-pointer"
              >
                <option value="">👤 Unassigned</option>
                {modalUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Estimate */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">Estimate (pts)</label>
              <select
                value={estimate}
                onChange={(e) => setEstimate(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none"
              >
                <option value={1}>1 pt</option>
                <option value={2}>2 pts</option>
                <option value={3}>3 pts</option>
                <option value={5}>5 pts</option>
                <option value={8}>8 pts</option>
              </select>
            </div>

            {/* Sprint / Cycle */}
            {!isCrossTeam && (
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Sprint Cycle</label>
                <select
                  value={cycleId}
                  onChange={(e) => setCycleId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none cursor-pointer"
                >
                  <option value="">No cycle (Backlog)</option>
                  {teamCycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || `Cycle ${c.number}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-30 transition-colors shadow-xs active:scale-95 cursor-pointer"
            >
              {isSubmitting ? 'Creating...' : 'Create Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
