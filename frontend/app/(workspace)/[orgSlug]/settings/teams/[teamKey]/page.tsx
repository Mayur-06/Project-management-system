/**
 * @related-files:
 * - frontend/app/(workspace)/[orgSlug]/settings/layout.tsx
 * - frontend/components/settings/SettingsModal.tsx
 * - frontend/lib/api.ts
 * - frontend/types/index.ts
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Loader2, Check, AlertCircle, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Team, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function TeamSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';
  const { teams, workspaceUsers } = useWorkspace();

  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [newTeamKey, setNewTeamKey] = useState('');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
  const [states, setStates] = useState<WorkflowState[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    api.getTeams(orgSlug)
      .then((fetchedTeams) => {
        if (!isMounted) return;
        const matched =
          fetchedTeams.find((t) => t.key.toUpperCase() === teamKey) ||
          fetchedTeams[0] ||
          null;

        if (matched) {
          setActiveTeam(matched);
          setTeamName(matched.name);
          setNewTeamKey(matched.key);

          Promise.all([
            api.getTeamMembers(matched.id),
            api.getWorkflowStates(matched.id),
          ]).then(([membersRes, statesRes]) => {
            if (!isMounted) return;
            setTeamMembers(membersRes || []);
            setStates(statesRes || []);
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load team data', err);
        setError('Failed to load team information.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [orgSlug, teamKey]);

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam) return;

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const updated = await api.updateTeam(activeTeam.id, {
        name: teamName.trim(),
        key: newTeamKey.trim().toUpperCase() || undefined,
      });

      if (updated) {
        setActiveTeam(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);

        // If key changed, update URL
        if (updated.key.toUpperCase() !== teamKey) {
          router.push(`/${orgSlug}/settings/teams/${updated.key.toLowerCase()}`);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update team settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!activeTeam || !selectedUserToAdd || isAddingMember) return;
    setIsAddingMember(true);
    setError(null);

    try {
      const added = await api.addTeamMember(activeTeam.id, selectedUserToAdd);
      if (added) {
        setTeamMembers((prev) => [...prev.filter((m) => m.user_id !== selectedUserToAdd), added]);
        setSelectedUserToAdd('');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to add team member.');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeTeam) return;
    try {
      await api.removeTeamMember(activeTeam.id, userId);
      setTeamMembers((prev) => prev.filter((m) => (m.user_id || m.id) !== userId));
    } catch (err: any) {
      setError(err?.message || 'Failed to remove team member.');
    }
  };

  // Available users in workspace who are not yet members of this team
  const availableUsers = workspaceUsers.filter(
    (wu) => !teamMembers.some((tm) => tm.user_id === wu.user_id || tm.id === wu.user_id)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mr-2" />
        <span>Loading team settings...</span>
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="text-center py-12 text-zinc-400">
        <p>Team {teamKey} could not be found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 font-sans">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Team settings saved successfully.</span>
        </div>
      )}

      {/* General Team Info Form */}
      <section className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white">General Information</h3>
          <p className="text-xs text-zinc-400 mt-1">Manage team name, identifier key, and identifier prefixes.</p>
        </div>

        <form onSubmit={handleSaveTeam} className="space-y-4 max-w-xl">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Team Name</label>
            <input
              type="text"
              required
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full text-xs bg-zinc-900 text-white px-3 py-2 rounded-md border border-zinc-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Team Key / Prefix</label>
            <input
              type="text"
              required
              maxLength={6}
              value={newTeamKey}
              onChange={(e) => setNewTeamKey(e.target.value.toUpperCase())}
              className="w-full text-xs bg-zinc-900 text-white px-3 py-2 rounded-md border border-zinc-800 font-mono focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-zinc-500">
              Issues created under this team will prefix identifiers with this key (e.g. {newTeamKey}-123).
            </p>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Save Team Settings</span>
          </button>
        </form>
      </section>

      {/* Team Members Section */}
      <section className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Team Members ({teamMembers.length})</h3>
          <p className="text-xs text-zinc-400 mt-1">Users assigned to this specific team.</p>
        </div>

        {/* Add Member Bar */}
        {availableUsers.length > 0 && (
          <div className="flex items-center gap-2 max-w-md">
            <select
              value={selectedUserToAdd}
              onChange={(e) => setSelectedUserToAdd(e.target.value)}
              className="flex-1 text-xs bg-zinc-900 text-zinc-200 px-3 py-2 rounded-md border border-zinc-800 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select workspace user...</option>
              {availableUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.user?.name || u.user?.email} ({u.user?.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddMember}
              disabled={!selectedUserToAdd || isAddingMember}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        )}

        {/* Members List */}
        <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-lg overflow-hidden bg-black/40">
          {teamMembers.length === 0 ? (
            <div className="p-4 text-xs text-zinc-500 text-center">No members assigned to this team.</div>
          ) : (
            teamMembers.map((tm) => (
              <div key={tm.id || tm.user_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
                    {(tm.user?.name || tm.user?.email || 'M').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-zinc-200">{tm.user?.name || tm.user?.email}</div>
                    <div className="text-[11px] text-zinc-500">{tm.user?.email}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveMember(tm.user_id || tm.id)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Remove from team"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Workflow States Summary */}
      <section className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Workflow States</h3>
          <p className="text-xs text-zinc-400 mt-1">Configured stages for this team&apos;s issue lifecycle.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {states.map((st) => (
            <div
              key={st.id}
              className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color || '#6366f1' }} />
                <span className="text-xs font-medium text-zinc-200">{st.name}</span>
              </div>
              <span className="text-[10px] text-zinc-500 uppercase">{st.category}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
