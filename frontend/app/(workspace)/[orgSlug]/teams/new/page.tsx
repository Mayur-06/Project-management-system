/**
 * @related-files:
 * - frontend/components/teams/CreateTeamModal.tsx
 * - frontend/components/sidebar/WorkspaceSidebar.tsx
 * - frontend/lib/api.ts
 * - frontend/types/index.ts
 */

'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, ArrowLeft, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

export default function NewTeamPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    const clean = val.trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (clean.length > 0) {
      setKey(clean.slice(0, 4));
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/${orgSlug}/issues`);
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
        setError('Failed to create team. Ensure key is unique and you have proper permissions.');
        setIsSubmitting(false);
        return;
      }

      // Navigate to the new team's board
      router.push(`/${orgSlug}/${newTeam.key.toLowerCase()}/issues`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create team.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-y-auto bg-black font-sans">
      {/* Top Header */}
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
              {orgSlug.toUpperCase()}
            </span>
            <span className="text-zinc-600">•</span>
            <h1 className="text-sm font-semibold text-zinc-100">Create New Team</h1>
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
            form="create-team-form"
            disabled={isSubmitting || !name.trim() || !key.trim()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Team</span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-2xl w-full mx-auto p-6 md:p-8 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form id="create-team-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
                <Users className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Team Details</h2>
                <p className="text-xs text-zinc-400">Establish a dedicated issue queue, prefix, and board</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 block">
                Team Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Platform, Design, Marketing, Mobile"
                className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-md border border-zinc-800 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5 max-w-xs">
              <label className="text-xs font-medium text-zinc-300 block">
                Identifier Key / Prefix <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={5}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                placeholder="ENG"
                className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-md border border-zinc-800 focus:border-indigo-500 focus:outline-none font-mono uppercase transition-colors"
              />
              <p className="text-[11px] text-zinc-500">
                Prefix for all issue IDs under this team (e.g. {key || 'ENG'}-101)
              </p>
            </div>

            <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-lg text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Automated Workflow Configuration</span>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                New teams are automatically provisioned with the standard 6 workflow states: 
                <span className="font-mono text-zinc-300 ml-1">Backlog, Todo, In Progress, In Review, Done, Canceled</span>.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
