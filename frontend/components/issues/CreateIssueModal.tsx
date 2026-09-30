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
  
  // Real-time debounced duplicate check
  const [duplicateMatches, setDuplicateMatches] = useState<{ id: string; title: string; similarity: number }[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (states.length > 0 && !stateId) {
      setStateId(states[0].id);
    }
  }, [states, stateId]);

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
      const created = await api.createIssue({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-[#0f1013] border border-[#23262e] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#1c1f26] flex items-center justify-between bg-[#0b0c0f]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/50 font-mono">
              {teamKey}
            </span>
            <span className="text-xs text-zinc-500 font-medium">New Issue</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1">
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
              className="w-full bg-transparent text-base font-semibold text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
          </div>

          {/* Real-time Semantic Duplicate Banner */}
          {duplicateMatches.length > 0 && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl space-y-1.5 animate-fade-in">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Potential Similar Issues Found:</span>
              </div>
              <div className="space-y-1 pl-5">
                {duplicateMatches.map((m) => (
                  <div key={m.id} className="text-xs text-amber-200/80 flex items-center justify-between">
                    <span className="truncate max-w-[80%]">• {m.title}</span>
                    <span className="text-[10px] text-amber-400 font-mono">{Math.round(m.similarity * 100)}% match</span>
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
              className="w-full bg-[#14161b] text-xs text-zinc-200 placeholder-zinc-500 p-3 rounded-xl border border-[#23262e] focus:border-indigo-500 focus:outline-none resize-none leading-relaxed"
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
                className="w-full bg-[#14161b] border border-[#23262e] text-xs text-zinc-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
              >
                {states.map((s) => (
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
                className="w-full bg-[#14161b] border border-[#23262e] text-xs text-zinc-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
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
                className="w-full bg-[#14161b] border border-[#23262e] text-xs text-zinc-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
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
                className="w-full bg-[#14161b] border border-[#23262e] text-xs text-zinc-200 rounded-lg p-2 focus:border-indigo-500 focus:outline-none"
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
          <div className="pt-4 border-t border-[#1c1f26] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1d24] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors shadow-md active:scale-95 cursor-pointer"
            >
              {isSubmitting ? 'Creating...' : 'Create Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
