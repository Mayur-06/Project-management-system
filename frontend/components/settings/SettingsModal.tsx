'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Users,
  User,
  Check,
  Loader2,
  Mail,
  Shield,
  Clock,
  Sparkles,
  LogOut,
  Keyboard,
  UserPlus,
  UserMinus,
} from 'lucide-react';
import { Organization, Team, WorkspaceMember } from '@/types';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization: Organization | null;
  currentTeam: Team | null;
  onWorkspaceUpdated?: (updated: Organization) => void;
  onTeamUpdated?: (updated: Team) => void;
}

type TabType = 'workspace' | 'members' | 'profile';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  organization,
  currentTeam,
  onWorkspaceUpdated,
  onTeamUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('workspace');
  
  // Workspace & Team state
  const [orgName, setOrgName] = useState(organization?.name || '');
  const [teamName, setTeamName] = useState(currentTeam?.name || '');
  const [teamKey, setTeamKey] = useState(currentTeam?.key || '');
  const [cycleWeeks, setCycleWeeks] = useState(currentTeam?.cycle_duration_weeks || 2);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Members state
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Team members state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoadingTeamMembers, setIsLoadingTeamMembers] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
  const [isAddingTeamMember, setIsAddingTeamMember] = useState(false);

  // Synchronize initial values when modal opens
  useEffect(() => {
    if (organization) {
      setOrgName(organization.name);
    }
    if (currentTeam) {
      setTeamName(currentTeam.name);
      setTeamKey(currentTeam.key || '');
      setCycleWeeks(currentTeam.cycle_duration_weeks || 2);
    }
    setTeamError(null);
  }, [organization, currentTeam, isOpen]);

  // Load members when members tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'members' && organization?.slug) {
      setIsLoadingMembers(true);
      api
        .getWorkspaceMembers(organization.slug)
        .then((data) => setMembers(data))
        .catch(() => setMembers([]))
        .finally(() => setIsLoadingMembers(false));

      if (currentTeam?.id) {
        setIsLoadingTeamMembers(true);
        api
          .getTeamMembers(currentTeam.id)
          .then((data) => setTeamMembers(data))
          .catch(() => setTeamMembers([]))
          .finally(() => setIsLoadingTeamMembers(false));
      }
    }
  }, [isOpen, activeTab, organization?.slug, currentTeam?.id]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveWorkspaceAndTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setTeamError(null);

    try {
      if (organization?.slug && orgName.trim() !== organization.name) {
        const updatedOrg = await api.updateWorkspace(organization.slug, { name: orgName.trim() });
        if (updatedOrg && onWorkspaceUpdated) {
          onWorkspaceUpdated(updatedOrg);
        }
      }

      if (
        currentTeam?.id &&
        (teamName.trim() !== currentTeam.name ||
          (teamKey.trim().toUpperCase() && teamKey.trim().toUpperCase() !== currentTeam.key) ||
          cycleWeeks !== currentTeam.cycle_duration_weeks)
      ) {
        const updatedTeam = await api.updateTeam(currentTeam.id, {
          name: teamName.trim(),
          key: teamKey.trim().toUpperCase() || undefined,
          cycle_duration_weeks: cycleWeeks,
        });
        if (updatedTeam && onTeamUpdated) {
          onTeamUpdated(updatedTeam);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setTeamError(err?.message || 'Failed to update team settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTeamMember = async (userId: string) => {
    if (!currentTeam?.id || !userId || isAddingTeamMember) return;
    setIsAddingTeamMember(true);
    try {
      const added = await api.addTeamMember(currentTeam.id, userId);
      if (added) {
        setTeamMembers((prev) => {
          const filtered = prev.filter((tm) => tm.user_id !== userId);
          return [...filtered, added];
        });
        setSelectedUserToAdd('');
      }
    } catch (err) {
      console.error('Failed to add team member', err);
    } finally {
      setIsAddingTeamMember(false);
    }
  };

  const handleRemoveTeamMember = async (userId: string) => {
    if (!currentTeam?.id || !userId) return;
    try {
      await api.removeTeamMember(currentTeam.id, userId);
      setTeamMembers((prev) => prev.filter((tm) => tm.user_id !== userId));
    } catch (err) {
      console.error('Failed to remove team member', err);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !organization?.slug || isInviting) return;
    setIsInviting(true);

    try {
      const invited = await api.inviteMember(organization.slug, inviteEmail.trim(), inviteRole);
      if (invited) {
        setMembers((prev) => {
          const filtered = prev.filter((m) => m.user?.email !== invited.user?.email);
          return [...filtered, invited];
        });
        setInviteEmail('');
        setInviteSuccess(true);
        setTimeout(() => setInviteSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to invite member', err);
    } finally {
      setIsInviting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('supabase_access_token');
      document.cookie = 'sb-access-token=; path=/; max-age=0; SameSite=Lax';
      await supabase.auth.signOut();
    } catch {
      // Ignore
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop (clicking outside does NOT close modal, only ESC or X) */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-[#0f1115] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col z-10 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-[#14171d]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
              <p className="text-xs text-zinc-400">{organization?.name || 'Workspace'} preferences</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-mono px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900">
              ESC
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-zinc-800/80 bg-[#12141a]/40 text-xs">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`flex items-center gap-2 px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'workspace'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Workspace & Team
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'members'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Members & Access
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            My Profile
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: WORKSPACE & TEAM */}
          {activeTab === 'workspace' && (
            <form onSubmit={handleSaveWorkspaceAndTeam} className="space-y-6">
              {/* Workspace Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Organization Details
                  </h3>
                  <span className="text-[11px] text-zinc-500">Admin Only</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      className="w-full bg-[#161920] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      URL Slug
                    </label>
                    <div className="flex items-center bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400">
                      <span>app.linear/</span>
                      <span className="text-zinc-200 font-medium ml-0.5">{organization?.slug || 'acme'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-zinc-800/80" />

              {/* Team Section */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Team & Sprint Cadence
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Active Team Name
                    </label>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      required
                      className="w-full bg-[#161920] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Issue Identifier Key
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={teamKey}
                        onChange={(e) => setTeamKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        maxLength={8}
                        required
                        className="w-28 bg-[#161920] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono font-semibold text-indigo-400 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors uppercase"
                      />
                      <span className="text-[11px] text-zinc-500">(Prefix for {teamKey || 'KEY'}-1, {teamKey || 'KEY'}-2)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Sprint Cycle Duration
                  </label>
                  <div className="flex items-center gap-3">
                    <select
                      value={cycleWeeks}
                      onChange={(e) => setCycleWeeks(Number(e.target.value))}
                      className="bg-[#161920] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                    >
                      <option value={1}>1 Week (Weekly)</option>
                      <option value={2}>2 Weeks (Standard Sprint)</option>
                      <option value={3}>3 Weeks</option>
                      <option value={4}>4 Weeks (Monthly)</option>
                    </select>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Incomplete issues automatically migrate upon cycle close.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save footer */}
              <div className="pt-2 flex items-center justify-end gap-3">
                {teamError && (
                  <span className="text-xs text-red-400">
                    {teamError}
                  </span>
                )}
                {saveSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="w-3.5 h-3.5" />
                    Settings saved successfully
                  </span>
                )}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-indigo-500/20"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: MEMBERS & ACCESS */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              {/* Invite member row */}
              <form onSubmit={handleInviteMember} className="p-3.5 bg-[#14171e]/70 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-200">Invite New Collaborator</span>
                  <span className="text-[11px] text-zinc-500">Fast invite via email</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      required
                      className="w-full pl-8 pr-3 py-1.5 bg-[#181b22] border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                    className="bg-[#181b22] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Invite
                  </button>
                </div>
                {inviteSuccess && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Invitation dispatched! Member added to workspace.
                  </p>
                )}
              </form>

              {/* Members table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
                  <span>Workspace Members ({members.length || 1})</span>
                  <span>Role</span>
                </div>

                {isLoadingMembers ? (
                  <div className="flex items-center justify-center py-8 text-zinc-500 text-xs gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    Loading members...
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-lg overflow-hidden bg-[#13161c]/40">
                    {(members.length > 0
                      ? members
                      : [
                          {
                            id: 'mem-1',
                            organization_id: organization?.id || '',
                            user_id: '00000000-0000-0000-0000-000000000001',
                            role: 'admin' as const,
                            created_at: new Date().toISOString(),
                            user: {
                              id: '00000000-0000-0000-0000-000000000001',
                              name: 'Alex Chen',
                              email: 'alex@acme.inc',
                            },
                          },
                        ]
                    ).map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-3.5 py-2.5 hover:bg-zinc-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold text-white shadow-sm">
                            {m.user?.name ? m.user.name.slice(0, 2).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-zinc-200">
                              {m.user?.name || 'Workspace Member'}
                            </p>
                            <p className="text-[11px] text-zinc-500">{m.user?.email || 'member@acme.inc'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {m.status === 'invited' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Pending Invite
                            </span>
                          )}
                          <span
                            className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              m.role === 'admin'
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                            }`}
                          >
                            <Shield className="w-3 h-3" />
                            {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Team Members Section */}
              {currentTeam && (
                <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">
                        {currentTeam.name} Team Members ({teamMembers.length})
                      </h4>
                      <p className="text-[11px] text-zinc-500">
                        Collaborators assigned to team {currentTeam.key}
                      </p>
                    </div>

                    {/* Quick Add Member to Team */}
                    {members.filter((m) => !teamMembers.some((tm) => tm.user_id === m.user_id)).length > 0 && (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedUserToAdd}
                          onChange={(e) => setSelectedUserToAdd(e.target.value)}
                          className="bg-[#181b22] border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        >
                          <option value="">Select workspace member...</option>
                          {members
                            .filter((m) => !teamMembers.some((tm) => tm.user_id === m.user_id))
                            .map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.user?.name || m.user?.email || m.user_id}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={!selectedUserToAdd || isAddingTeamMember}
                          onClick={() => handleAddTeamMember(selectedUserToAdd)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isAddingTeamMember ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <UserPlus className="w-3 h-3" />
                          )}
                          Add to Team
                        </button>
                      </div>
                    )}
                  </div>

                  {isLoadingTeamMembers ? (
                    <div className="flex items-center justify-center py-6 text-zinc-500 text-xs gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      Loading team members...
                    </div>
                  ) : teamMembers.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic py-2">No members assigned to this team yet.</p>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-lg overflow-hidden bg-[#13161c]/40">
                      {teamMembers.map((tm) => (
                        <div
                          key={tm.id}
                          className="flex items-center justify-between px-3.5 py-2.5 hover:bg-zinc-800/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-[11px] font-semibold text-white shadow-sm">
                              {tm.user?.name ? tm.user.name.slice(0, 2).toUpperCase() : 'TM'}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-zinc-200">
                                {tm.user?.name || `Team Member ${tm.user_id?.slice(0, 4)}`}
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                {tm.user?.email || 'member@acme.inc'}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveTeamMember(tm.user_id)}
                            title="Remove from team"
                            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                          >
                            <UserMinus className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MY PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Profile Card */}
              <div className="p-4 bg-[#14171e]/70 border border-zinc-800 rounded-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-md">
                  AC
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">Alex Chen</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-medium">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">alex@acme.inc</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Signed in with Supabase Authentication</p>
                </div>
              </div>

              {/* Quick Shortcuts Cheatsheet */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Essential Keyboard Shortcuts</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-[#14161d] border border-zinc-800/80 rounded-lg">
                    <span className="text-zinc-300">Command Palette</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                      Cmd + K
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#14161d] border border-zinc-800/80 rounded-lg">
                    <span className="text-zinc-300">Settings Dialog</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                      Cmd + ,
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#14161d] border border-zinc-800/80 rounded-lg">
                    <span className="text-zinc-300">Create New Issue</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                      C
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#14161d] border border-zinc-800/80 rounded-lg">
                    <span className="text-zinc-300">Dismiss / Close Modal</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                      ESC
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Theme & Session */}
              <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Theme: High-Contrast Dark (Linear Default)</span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
