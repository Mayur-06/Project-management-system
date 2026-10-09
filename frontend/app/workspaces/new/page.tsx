/**
 * @related-files:
 * - frontend/components/sidebar/WorkspaceSidebar.tsx
 * - frontend/lib/api.ts
 * - frontend/types/index.ts
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowLeft, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

export default function NewWorkspacePage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [teamName, setTeamName] = useState('Engineering');
  const [teamKey, setTeamKey] = useState('ENG');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    const clean = val.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    setSlug(clean);
  };

  const handleTeamNameChange = (val: string) => {
    setTeamName(val);
    const cleanKey = val.trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (cleanKey.length > 0) {
      setTeamKey(cleanKey.slice(0, 4));
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanSlug = slug.trim().toLowerCase();
    const cleanTeamName = teamName.trim() || 'Engineering';
    const cleanTeamKey = (teamKey.trim() || 'ENG').toUpperCase();

    if (!cleanName) {
      setError('Workspace name is required.');
      return;
    }
    if (!cleanSlug || cleanSlug.length < 2) {
      setError('Workspace slug must be at least 2 characters.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await api.createWorkspace(cleanName, cleanSlug);
      if (!created) {
        setError('Failed to create workspace. The slug may already be taken.');
        setIsSubmitting(false);
        return;
      }

      // Provision default team
      const initialTeam = await api.createTeam(created.slug, {
        name: cleanTeamName,
        key: cleanTeamKey,
      });

      const effectiveKey = initialTeam?.key ? initialTeam.key.toLowerCase() : cleanTeamKey.toLowerCase();
      router.push(`/${created.slug}/${effectiveKey}/issues`);
    } catch (err: any) {
      setError(err?.message || 'Error creating workspace.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-black text-white flex flex-col font-sans">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 sticky top-0 z-10 backdrop-blur-md">
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
            <Building2 className="w-4 h-4 text-indigo-400" />
            <h1 className="text-sm font-semibold text-zinc-100">Create New Workspace</h1>
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
            form="create-workspace-form"
            disabled={isSubmitting || !name.trim() || !slug.trim()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Workspace</span>
            )}
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <div className="flex-1 max-w-2xl w-full mx-auto p-6 md:p-12 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form id="create-workspace-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Workspace Details Card */}
          <div className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-white">Workspace Details</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Your organization or company shared hub</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 block">
                Workspace Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-md border border-zinc-800 focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 block">
                Workspace URL Slug <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-400 focus-within:border-indigo-500">
                <span className="select-none font-mono text-zinc-500">app/</span>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme-corp"
                  className="bg-transparent text-white font-mono flex-1 focus:outline-none ml-1"
                />
              </div>
            </div>
          </div>

          {/* Initial Team Card */}
          <div className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-white">Initial Team Setup</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Every workspace begins with at least one team queue</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 block">Team Name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => handleTeamNameChange(e.target.value)}
                  placeholder="Engineering"
                  className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-md border border-zinc-800 focus:border-indigo-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 block">Team Key</label>
                <input
                  type="text"
                  maxLength={5}
                  value={teamKey}
                  onChange={(e) => setTeamKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                  placeholder="ENG"
                  className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-md border border-zinc-800 focus:border-indigo-500 focus:outline-none font-mono uppercase transition-colors"
                />
              </div>
            </div>

            <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-lg text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Ready out of the box</span>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                You can invite teammates and add more specialized teams anytime from Workspace Settings.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
