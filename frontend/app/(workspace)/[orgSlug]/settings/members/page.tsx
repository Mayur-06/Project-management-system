'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Loader2, 
  Check, 
  Mail, 
  Shield, 
  UserPlus, 
  UserMinus,
  AlertCircle,
  Plus,
  Search,
  MoreVertical
} from 'lucide-react';
import { WorkspaceMember, Team } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function MembersSettingsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const { organization, currentUser, workspaceUsers, currentTeam } = useWorkspace();
  
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const isAdmin = currentMember?.role === 'admin' || currentUser?.id === '00000000-0000-0000-0000-000000000001';

  useEffect(() => {
    const loadMembers = async () => {
      try {
        if (organization?.slug) {
          const data = await api.getWorkspaceMembersSettings(organization.slug);
          setMembers(data || []);
        }
      } catch (err) {
        console.error('Failed to load members', err);
        setMembers([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadMembers();
  }, [organization?.slug]);

  const filteredMembers = members.filter((m) =>
    m.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.user?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !organization?.slug || isInviting || !isAdmin) return;
    
    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      const invited = await api.inviteWorkspaceMember(organization.slug, inviteEmail.trim(), inviteRole);
      if (invited) {
        setMembers((prev) => {
          const filtered = prev.filter((m) => m.user?.email !== invited.user?.email);
          return [...filtered, invited];
        });
        setInviteEmail('');
        setInviteSuccess(true);
        setTimeout(() => setInviteSuccess(false), 2500);
      }
    } catch (err: any) {
      setInviteError(err?.message || 'Failed to invite member');
    } finally {
      setIsInviting(false);
    }
  };

  const getInitials = (name: string | undefined, email: string | undefined) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.[0]?.toUpperCase() || 'U';
  };

  const getRoleBadge = (role: string) => {
    const isAdminRole = role === 'admin';
    return (
      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        isAdminRole
          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
          : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
      }`}>
        <Shield className="w-3 h-3" />
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span>Loading members...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Invite Member Section */}
      {isAdmin ? (
        <section className="space-y-6">
          <h3 className="text-lg font-semibold text-white">Invite New Member</h3>
          <form onSubmit={handleInvite} className="p-4 bg-[#14171e]/70 border border-zinc-800 rounded-xl space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-[#181b22] border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                className="bg-[#181b22] border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={isInviting || !inviteEmail.trim()}
                className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInviting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Inviting...
                  </>
                ) : (
                  'Invite'
                )}
              </button>
            </div>
            {inviteError && (
              <p className="text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {inviteError}
              </p>
            )}
            {inviteSuccess && (
              <p className="text-sm text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Invitation dispatched! Member added to workspace.
              </p>
            )}
          </form>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="p-4 bg-[#14171e]/40 border border-zinc-800/80 rounded-xl flex items-center justify-between text-sm text-zinc-400">
            <span>Only workspace admins can invite new members.</span>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700/50">
              Member Role
            </span>
          </div>
        </section>
      )}

      {/* Members List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Workspace Members ({members.length})
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members..."
              className="pl-10 pr-4 py-2 bg-[#181b22] border border-zinc-800 rounded-lg w-64 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <p>No members found</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-lg overflow-hidden bg-[#13161c]/40">
            {filteredMembers.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-semibold text-white shadow-sm">
                    {getInitials(m.user?.name, m.user?.email)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {m.user?.name || 'Workspace Member'}
                    </p>
                    <p className="text-xs text-zinc-500">{m.user?.email || 'member@workspace.com'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {m.status === 'invited' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Pending Invite
                    </span>
                  )}
                  {getRoleBadge(m.role)}
                  {isAdmin && m.user_id !== currentUser?.id && (
                    <button
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Remove member"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Team Members Section */}
      {currentTeam && (
        <section className="space-y-4 pt-8 border-t border-zinc-800/80">
          <h3 className="text-lg font-semibold text-white">
            {currentTeam.name} Team Members
          </h3>
          <p className="text-sm text-zinc-500">
            Team-specific member management would go here
          </p>
        </section>
      )}
    </div>
  );
}