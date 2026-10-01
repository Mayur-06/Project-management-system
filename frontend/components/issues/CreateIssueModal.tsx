'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
} from 'lucide-react';
import { IssuePriority, Issue, WorkflowState, User, Label, Project, Cycle } from '@/types';
import { api } from '@/lib/api';

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
  initialStateId?: string;
  states?: WorkflowState[];
  users?: User[];
  labels?: Label[];
  projects?: Project[];
  cycles?: Cycle[];
  teamKey?: string;
  teamId?: string;
}

export const CreateIssueModal: React.FC<CreateIssueModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialStateId = 'st_todo',
  states = [],
  users = [],
  labels = [],
  projects = [],
  cycles = [],
  teamKey = 'ENG',
  teamId,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('none');
  const [stateId, setStateId] = useState(initialStateId);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [estimate, setEstimate] = useState<number>(2);
  const [projectId, setProjectId] = useState<string>('');
  const [cycleId, setCycleId] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [modalUsers, setModalUsers] = useState<User[]>(users);

  useEffect(() => {
    if (users && users.length > 0) {
      setModalUsers(users);
    }
  }, [users]);

  useEffect(() => {
    if (isOpen && teamId && (!users || users.length === 0)) {
      api.getTeamMembers(teamId).then((tms) => {
        if (tms && tms.length > 0) {
          setModalUsers(
            tms.map((tm: any) => ({
              id: tm.user_id || tm.id,
              name: tm.user?.name || tm.user?.email || 'Member',
              email: tm.user?.email || '',
            }))
          );
        }
      }).catch(() => {});
    }
  }, [isOpen, teamId, users]);
  
  // Real-time debounced duplicate check
  const [duplicateMatches, setDuplicateMatches] = useState<{ id: string; title: string; similarity: number }[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeStates = states.filter((s) => s.category !== 'triage');

  useEffect(() => {
    if (initialStateId) {
      setStateId(initialStateId);
    } else if (activeStates.length > 0 && !stateId) {
      setStateId(activeStates[0].id);
    }
  }, [initialStateId, isOpen, states]);

  useEffect(() => {
    if (title.trim().length < 10) {
      setDuplicateMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      const res = await api.checkDuplicates(title);
      setDuplicateMatches(res.duplicates || []);
      setIsCheckingDuplicates(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [title]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const resolvedTeamId = teamId || states[0]?.team_id;
      const created = await api.createIssue({
        team_id: resolvedTeamId,
        title,
        description_text: description,
        priority,
        state_id: stateId || states[0]?.id,
        assignee_id: assigneeId || undefined,
        estimate,
        project_id: projectId || undefined,
        cycle_id: cycleId || undefined,
        labels: labels.filter((l) => selectedLabels.includes(l.id)),
      });
      if (created) {
        onCreated(created);
      }
      onClose();
      setTitle('');
      setDescription('');
    } catch (err) {
      console.error('Failed to create issue', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="w-full max-w-2xl bg-black border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700 font-mono">
              {teamKey}
            </span>
            <span className="text-xs text-zinc-400 font-medium">New Issue</span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
            <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-1.5 animate-fade-in">
              <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Potential Similar Issues Found:</span>
              </div>
              <div className="space-y-1 pl-5">
                {duplicateMatches.map((m) => (
                  <div key={m.id} className="text-xs text-zinc-300 flex items-center justify-between">
                    <span className="truncate max-w-[80%]">• {m.title}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">{Math.round(m.similarity * 100)}% match</span>
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
