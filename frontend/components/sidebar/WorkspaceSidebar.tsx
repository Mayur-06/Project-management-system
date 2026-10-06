'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Layers,
  FolderKanban,
  Sparkles,
  Command,
  Plus,
  ChevronDown,
  Settings,
  User as UserIcon,
  LogOut,
  Inbox,
  List,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { Organization, Team, User, UserWorkspaceItem } from '@/types';
import { CreateTeamModal } from '@/components/teams/CreateTeamModal';
import { Check, Building2, ExternalLink } from 'lucide-react';

interface WorkspaceSidebarProps {
  currentOrgSlug?: string;
  currentTeamKey?: string;
  organization?: Organization | null;
  teams?: Team[];
  currentUser?: User | null;
  onOpenCommandPalette: () => void;
  onOpenNewIssue: () => void;
  onOpenAIAsk: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  currentOrgSlug = '',
  currentTeamKey = '',
  organization,
  teams = [],
  currentUser,
  onOpenCommandPalette,
  onOpenNewIssue,
  onOpenAIAsk,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [userWorkspaces, setUserWorkspaces] = useState<UserWorkspaceItem[]>([]);
  
  // New workspace modal form state
  const [newWsName, setNewWsName] = useState('');
  const [newWsSlug, setNewWsSlug] = useState('');
  const [newWsTeamName, setNewWsTeamName] = useState('Engineering');
  const [newWsTeamKey, setNewWsTeamKey] = useState('ENG');
  const [isCreatingWs, setIsCreatingWs] = useState(false);
  const [createWsError, setCreateWsError] = useState<string | null>(null);

  const [orgState, setOrgState] = useState<Organization | null>(organization || null);
  const orgName = orgState?.name || organization?.name || currentOrgSlug.toUpperCase();
  const activeTeam = teams.find((t) => t.key.toUpperCase() === currentTeamKey.toUpperCase()) || teams[0] || null;
  const effectiveTeamKey = (currentTeamKey || activeTeam?.key || '').toLowerCase();

  // Load user workspaces for the switcher
  useEffect(() => {
    api.getMyWorkspaces().then((list) => {
      if (list && list.length > 0) {
        setUserWorkspaces(list);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (organization) {
      setOrgState(organization);
    }
  }, [organization]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('supabase_access_token');
        document.cookie = 'sb-access-token=; path=/; max-age=0';
      }
      window.location.href = '/login';
    }
  };

  const handleCreateNewWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingWs(true);
    setCreateWsError(null);

    const cleanSlug = newWsSlug.trim().toLowerCase();
    if (!cleanSlug || cleanSlug.length < 2) {
      setCreateWsError('Slug must be at least 2 characters.');
      setIsCreatingWs(false);
      return;
    }

    try {
      const created = await api.createWorkspace(newWsName.trim(), cleanSlug);
      if (!created) {
        setCreateWsError('Failed to create workspace. Please check the slug or server logs.');
        setIsCreatingWs(false);
        return;
      }

      // Create initial team
      const team = await api.createTeam(created.slug, {
        name: newWsTeamName.trim() || 'Engineering',
        key: (newWsTeamKey.trim() || 'ENG').toUpperCase(),
      });

      const teamKey = team?.key ? team.key.toLowerCase() : '';
      setIsCreateWorkspaceOpen(false);
      setIsWorkspaceDropdownOpen(false);
      window.location.href = teamKey ? `/${created.slug}/${teamKey}/issues` : `/${created.slug}/issues`;
    } catch (err: any) {
      setCreateWsError(err?.message || 'Error creating workspace');
      setIsCreatingWs(false);
    }
  };

  const navItems: { label: string; href: string; icon: React.ReactNode; badge?: string | number }[] = [
    {
      label: 'Inbox',
      href: effectiveTeamKey ? `/${currentOrgSlug}/${effectiveTeamKey}/inbox` : `/${currentOrgSlug}/inbox`,
      icon: <Inbox className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'Issues',
      href: effectiveTeamKey ? `/${currentOrgSlug}/${effectiveTeamKey}/issues` : `/${currentOrgSlug}/issues`,
      icon: <Layers className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'AI Assistant',
      href: effectiveTeamKey ? `/${currentOrgSlug}/${effectiveTeamKey}/ai` : `/${currentOrgSlug}/ai`,
      icon: <Sparkles className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'Settings',
      href: effectiveTeamKey ? `/${currentOrgSlug}/settings/workspace` : `/${currentOrgSlug}/settings/workspace`,
      icon: <Settings className="w-4 h-4 text-zinc-300" />,
    },
  ];

  return (
    <aside className="w-64 h-screen bg-black border-r border-zinc-800 flex flex-col justify-between select-none text-sm z-20 font-sans">
      {/* Workspace Header */}
      <div className="flex flex-col relative">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <button
            onClick={() => setIsWorkspaceDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2.5 w-full hover:bg-zinc-900/60 p-1 rounded-md transition-colors text-left cursor-pointer"
          >
            <div className="w-6 h-6 rounded bg-white text-black flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
              {orgName.charAt(0)}
            </div>
            <div className="flex items-center justify-between flex-1 min-w-0">
              <span className="font-semibold text-white truncate text-xs">{orgName}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform ${isWorkspaceDropdownOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </div>

        {/* Workspace Switcher Dropdown */}
        {isWorkspaceDropdownOpen && (
          <div className="absolute top-14 left-2 right-2 bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl p-2 z-50 animate-fade-in">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
              Your Workspaces
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto my-1">
              {userWorkspaces.length > 0 ? (
                userWorkspaces.map((item) => {
                  const isCurrent = item.organization.slug === currentOrgSlug;
                  const firstTeam = item.teams?.[0]?.key ? item.teams[0].key.toLowerCase() : '';
                  return (
                    <Link
                      key={item.organization.id}
                      href={firstTeam ? `/${item.organization.slug}/${firstTeam}/issues` : `/${item.organization.slug}/issues`}
                      onClick={() => setIsWorkspaceDropdownOpen(false)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                        isCurrent
                          ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-4 h-4 rounded bg-zinc-800 text-[10px] text-zinc-300 flex items-center justify-center font-bold shrink-0">
                          {item.organization.name.charAt(0)}
                        </div>
                        <span className="truncate">{item.organization.name}</span>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                    </Link>
                  );
                })
              ) : (
                <div className="px-2 py-1.5 text-xs text-zinc-400 truncate">
                  {orgName}
                </div>
              )}
            </div>

            <div className="pt-2 mt-1 border-t border-zinc-800/80">
              <button
                onClick={() => {
                  setIsWorkspaceDropdownOpen(false);
                  setIsCreateWorkspaceOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Workspace</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Action Buttons */}
        <div className="p-2 space-y-1">
          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Command className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white" />
              <span>Search & Command</span>
            </div>
            <kbd className="text-[10px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800">
              ⌘K
            </kbd>
          </button>

          <button
            onClick={onOpenAIAsk}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-zinc-200 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
              <span className="font-medium">AI Assistant</span>
            </div>
            <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1 rounded border border-zinc-700">Agent</span>
          </button>
        </div>

        {/* Primary Views */}
        <div className="px-2 py-2 space-y-0.5">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Workspace Views
          </div>
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-900 text-white border border-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-zinc-800 text-white border border-zinc-700 font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Teams Section */}
        {teams.length > 0 && (
          <div className="px-2 py-3 space-y-0.5 border-t border-zinc-800">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
              <span>Teams</span>
              <button
                type="button"
                onClick={() => setIsCreateTeamOpen(true)}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Create New Team"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {teams.map((team) => {
              const isTeamActive = currentTeamKey.toUpperCase() === team.key.toUpperCase();
              return (
                <Link
                  key={team.id}
                  href={`/${currentOrgSlug}/${team.key.toLowerCase()}/issues`}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                    isTeamActive
                      ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold ${
                        isTeamActive ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {team.key.slice(0, 2)}
                    </div>
                    <span>{team.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">{team.key}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-[#1a1c21] flex items-center justify-between bg-[#0a0b0c]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {currentUser?.avatar_url ? (
            <img
              src={currentUser.avatar_url}
              alt={currentUser.name}
              className="w-7 h-7 rounded-full ring-1 ring-zinc-700 object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
              <UserIcon className="w-4 h-4" />
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-zinc-200 truncate">
              {currentUser?.name || 'Workspace User'}
            </span>
            <span className="text-[10px] text-zinc-500 truncate">{currentUser?.email || ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-md hover:bg-[#1a1d22] text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
          <Link
            href={effectiveTeamKey ? `/${currentOrgSlug}/settings/workspace` : `/${currentOrgSlug}/settings/workspace`}
            className="p-1.5 rounded-md hover:bg-[#1a1d22] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Settings (Cmd+,)"
          >
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <CreateTeamModal
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
        orgSlug={currentOrgSlug}
        onTeamCreated={() => router.refresh()}
      />

      {/* Create Workspace Modal */}
      {isCreateWorkspaceOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-zinc-300" />
                <span>Create New Workspace</span>
              </h3>
              <button
                onClick={() => setIsCreateWorkspaceOpen(false)}
                className="text-zinc-500 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {createWsError && (
              <div className="p-2.5 bg-red-950/60 border border-red-800 rounded text-xs text-red-300">
                {createWsError}
              </div>
            )}

            <form onSubmit={handleCreateNewWorkspace} className="space-y-3">
              <div>
                <label className="text-xs text-zinc-300 block mb-1">Workspace Name</label>
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => {
                    setNewWsName(e.target.value);
                    setNewWsSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-|-$/g, '')
                    );
                  }}
                  placeholder="My Organization"
                  className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded border border-zinc-800 focus:border-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-zinc-300 block mb-1">URL Slug</label>
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded overflow-hidden focus-within:border-white">
                  <span className="text-[10px] text-zinc-500 pl-2.5 select-none">app/</span>
                  <input
                    type="text"
                    value={newWsSlug}
                    onChange={(e) => setNewWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="my-org"
                    className="w-full bg-transparent text-xs text-white px-2 py-2 focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-300 block mb-1">Initial Team</label>
                  <input
                    type="text"
                    value={newWsTeamName}
                    onChange={(e) => setNewWsTeamName(e.target.value)}
                    placeholder="Engineering"
                    className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded border border-zinc-800 focus:border-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-300 block mb-1">Team Key</label>
                  <input
                    type="text"
                    value={newWsTeamKey}
                    onChange={(e) => setNewWsTeamKey(e.target.value.toUpperCase().slice(0, 5))}
                    placeholder="ENG"
                    maxLength={5}
                    className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded border border-zinc-800 focus:border-white focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateWorkspaceOpen(false)}
                  className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingWs}
                  className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isCreatingWs ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
