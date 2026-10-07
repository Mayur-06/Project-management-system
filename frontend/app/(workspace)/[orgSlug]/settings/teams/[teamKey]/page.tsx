/**
 * @related-files:
 * - frontend/app/(workspace)/[orgSlug]/settings/layout.tsx
 * - frontend/lib/api.ts
 * - frontend/types/index.ts
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Check, AlertCircle, Plus, Trash2, Users } from 'lucide-react';
import { Team } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function TeamSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';
  const { currentUser, workspaceUsers } = useWorkspace();

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const isAdmin = currentMember?.role === 'admin' || currentUser?.id === '00000000-0000-0000-0000-000000000001';

  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [newTeamKey, setNewTeamKey] = useState('');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');

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

          api.getTeamMembers(matched.id).then((membersRes) => {
            if (!isMounted) return;
            setTeamMembers(membersRes || []);
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
    if (!activeTeam || isSaving) return;

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

        // If key changed, redirect to new URL
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
      <div className="flex items-center justify-center h-48 text-zinc-500 text-xs">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mr-2" />
        <span>Loading team settings...</span>
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="text-center py-12 text-zinc-400 text-xs">
        <p>Team {teamKey} could not be found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 font-sans">
      <div className="pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-white">{activeTeam.name}</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
            {activeTeam.key}
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Manage team name, identifier key, and assigned team members.
        </p>
      </div>

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
      <section className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
          <div>
            <h3 className="text-sm font-semibold text-white">General Information</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">Manage team identifier and prefix key.</p>
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
            isAdmin 
              ? 'bg-zinc-900 text-white border border-zinc-700' 
              : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
          }`}>
            {isAdmin ? 'Admin Edit Access' : 'View Only (Member)'}
          </span>
        </div>

        <form onSubmit={handleSaveTeam} className="space-y-4 max-w-xl">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Team Name</label>
            <input
              type="text"
              required
              disabled={!isAdmin}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full text-xs bg-zinc-900 text-white px-3 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Team Key / Prefix</label>
            <input
              type="text"
              required
              disabled={!isAdmin}
              maxLength={6}
              value={newTeamKey}
              onChange={(e) => setNewTeamKey(e.target.value.toUpperCase())}
              className="w-full text-xs bg-zinc-900 text-white px-3 py-2 rounded-lg border border-zinc-800 font-mono focus:outline-none focus:border-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-zinc-500">
              Issues created under this team will prefix identifiers with this key (e.g. {newTeamKey}-101).
            </p>
          </div>

          {isAdmin && (
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer shadow-sm"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Team Settings</span>
            </button>
          )}
        </form>
      </section>

      {/* Team Members Section */}
      <section className="bg-[#13161c]/40 border border-zinc-800/80 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" />
            <span>Team Members ({teamMembers.length})</span>
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">Teammates who can be assigned to issues in this team queue.</p>
        </div>

        {/* Add Member Bar (Admins only) */}
        {isAdmin && availableUsers.length > 0 && (
          <div className="flex items-center gap-2 max-w-md">
            <select
              value={selectedUserToAdd}
              onChange={(e) => setSelectedUserToAdd(e.target.value)}
              className="flex-1 text-xs bg-zinc-900 text-zinc-200 px-3 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-white transition-colors"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer shadow-sm"
            >
              {isAddingMember ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Add</span>
            </button>
          </div>
        )}

        {/* Members List */}
        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/40">
          {teamMembers.length === 0 ? (
            <div className="p-4 text-xs text-zinc-500 text-center">No members assigned to this team yet.</div>
          ) : (
            teamMembers.map((tm) => (
              <div key={tm.id || tm.user_id} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-bold text-zinc-200">
                    {(tm.user?.name || tm.user?.email || 'M').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white">{tm.user?.name || tm.user?.email}</div>
                    <div className="text-[11px] text-zinc-400 font-mono">{tm.user?.email}</div>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(tm.user_id || tm.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                    title="Remove from team"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
