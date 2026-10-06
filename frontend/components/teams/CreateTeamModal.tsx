'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, X, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Team } from '@/types';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
  onTeamCreated?: (team: Team) => void;
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({
  isOpen,
  onClose,
  orgSlug,
  onTeamCreated,
}) => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    // Auto-generate team key if user hasn't explicitly customized it
    const clean = val.trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (clean.length > 0) {
      setKey(clean.slice(0, 4));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanKey = key.trim().toUpperCase();

    if (!cleanName) {
      setError('Team name is required.');
      return;
    }
    if (!cleanKey || cleanKey.length < 2) {
      setError('Team key must be at least 2 characters (e.g. ENG, DES, OPS).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newTeam = await api.createTeam(orgSlug, {
        name: cleanName,
        key: cleanKey,
      });

      if (!newTeam) {
        setError('Failed to create team. Ensure you have admin privileges and key is unique.');
        setIsSubmitting(false);
        return;
      }

      onClose();
      if (onTeamCreated) {
        onTeamCreated(newTeam);
      }
      // Navigate to the new team's board
      router.push(`/${orgSlug}/${newTeam.key.toLowerCase()}/issues`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create team.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in font-sans">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <Users className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Create New Team</h3>
              <p className="text-[11px] text-zinc-400">Establish a dedicated issue queue and workflow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/60 border border-red-800 rounded text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">
              Team Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Platform, Design, Marketing, Mobile"
              className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-md border border-zinc-800 focus:border-white focus:outline-none transition-colors"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Identifier Key <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                  placeholder="ENG"
                  maxLength={5}
                  className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-md border border-zinc-800 focus:border-white focus:outline-none font-mono uppercase transition-colors"
                  required
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">Prefix for all issue IDs (e.g. {key || 'ENG'}-101)</p>
            </div>
          </div>

          <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-400 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-300 font-medium text-[11px]">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Standard Linear Workflow Initialized</span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              New teams are automatically provisioned with the standard 6 workflow states: 
              <span className="font-mono text-zinc-300 ml-1">Triage, Backlog, Todo, In Progress, In Review, Done, Canceled</span>.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !key.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? 'Creating Team...' : 'Create Team'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
