'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Loader2, 
  Check, 
  Mail, 
  Shield, 
  UserPlus, 
  AlertCircle,
  Search,
  Calendar,
  Layers
} from 'lucide-react';
import { WorkspaceMember, Team } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { toast } from 'sonner';

export default function MembersSettingsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const { organization, currentUser, workspaceUsers } = useWorkspace();
  
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [userTeamCounts, setUserTeamCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const isAdmin = currentMember?.role === 'admin' || currentUser?.id === '00000000-0000-0000-0000-000000000001';

  const effectiveOrgSlug = organization?.slug || orgSlug;

  const loadMembersAndTeamCounts = async () => {
    if (!effectiveOrgSlug) return;
    try {
      const [fetchedMembers, fetchedTeams] = await Promise.all([
        api.getWorkspaceMembers(effectiveOrgSlug),
        api.getTeams(effectiveOrgSlug),
      ]);

      setMembers(fetchedMembers || []);

      // Calculate number of teams each member belongs to
      if (fetchedTeams && fetchedTeams.length > 0) {
        const teamMemberPromises = fetchedTeams.map((t) => api.getTeamMembers(t.id).catch(() => []));
        const allTeamMembers = await Promise.all(teamMemberPromises);

        const counts: Record<string, number> = {};
        for (const tmList of allTeamMembers) {
          if (Array.isArray(tmList)) {
            for (const tm of tmList) {
              const uid = tm.user_id || tm.id;
              if (uid) {
                counts[uid] = (counts[uid] || 0) + 1;
              }
            }
          }
        }
        setUserTeamCounts(counts);
      }
    } catch (err) {
      console.error('Failed to load workspace members data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembersAndTeamCounts();
  }, [effectiveOrgSlug]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !effectiveOrgSlug || isInviting || !isAdmin) return;
    
    setIsInviting(true);

    try {
      const invited = await api.inviteMember(effectiveOrgSlug, inviteEmail.trim(), inviteRole);
      if (invited) {
        setMembers((prev) => {
          const filtered = prev.filter((m) => m.user?.email !== invited.user?.email);
          return [...filtered, invited];
        });
        setInviteEmail('');
        toast.success('Invite dispatched! Member added to workspace.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to invite member');
    } finally {
      setIsInviting(false);
    }
  };

  const getInitials = (name: string | undefined, email: string | undefined) => {
    if (name) {
      return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.[0]?.toUpperCase() || 'U';
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Recent';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recent';
    }
  };

  const filteredMembers = members.filter((m) =>
    m.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.user?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl space-y-8 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white">Members</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Manage who has access to this workspace and review team allocations.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search members..."
            className="pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors w-56"
          />
        </div>
      </div>

      {/* Invite Member Section (for Admins) */}
      {isAdmin && (
        <div className="p-5 bg-[#13161c]/40 border border-zinc-800/80 rounded-xl space-y-4">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
            <span>Invite New Member</span>
          </h3>

          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              />
            </div>

            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white transition-colors"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>

            <button
              type="submit"
              disabled={isInviting || !inviteEmail.trim()}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-white hover:bg-zinc-200 text-xs font-semibold text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            >
              {isInviting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Inviting...</span>
                </>
              ) : (
                <span>Send Invite</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Members Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <span>All Members ({members.length})</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-zinc-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mr-2" />
            <span>Loading members...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-8 border border-dashed border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
            No matching members found.
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-[#13161c]/30">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-4 font-medium">Email</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Teams</th>
                  <th className="py-3 px-4 font-medium">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredMembers.map((m) => {
                  const teamCount = userTeamCounts[m.user_id] ?? 0;
                  const isUserAdmin = m.role === 'admin';
                  const isInvited = m.status === 'invited';

                  return (
                    <tr key={m.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-bold text-zinc-200 shrink-0">
                            {getInitials(m.user?.name, m.user?.email)}
                          </div>
                          <span className="font-medium text-white truncate max-w-[160px]">
                            {m.user?.name || (isInvited ? 'Invited Member' : 'Workspace Member')}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px] truncate max-w-[200px]">
                        {m.user?.email || '—'}
                      </td>

                      {/* Status (Membership Type) */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          isInvited
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : isUserAdmin
                            ? 'bg-zinc-900 text-white border border-zinc-700'
                            : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                        }`}>
                          <Shield className="w-3 h-3" />
                          <span>
                            {isInvited ? 'Pending Invite' : m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                          </span>
                        </span>
                      </td>

                      {/* Teams (numeric count, not names) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-zinc-300">
                          <Layers className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="font-medium">
                            {teamCount} {teamCount === 1 ? 'team' : 'teams'}
                          </span>
                        </div>
                      </td>

                      {/* Joined Date */}
                      <td className="py-3.5 px-4 text-zinc-400 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-zinc-500" />
                          <span>{formatDate(m.created_at)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}