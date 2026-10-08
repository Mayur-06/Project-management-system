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
  ChevronRight,
  Settings,
  User as UserIcon,
  UserCheck,
  LogOut,
  Inbox,
  List,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { Organization, Team, User, UserWorkspaceItem } from '@/types';
import { Check, Building2, ExternalLink } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { WorkspaceSidebarSkeleton } from '@/components/skeletons/WorkspaceSidebarSkeleton';

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
  const [userWorkspaces, setUserWorkspaces] = useState<UserWorkspaceItem[]>([]);

  const [orgState, setOrgState] = useState<Organization | null>(organization || null);
  const orgName = orgState?.name || organization?.name || currentOrgSlug.toUpperCase();
  const activeTeam = teams.find((t) => t.key.toUpperCase() === currentTeamKey.toUpperCase()) || teams[0] || null;
  const effectiveTeamKey = (currentTeamKey || activeTeam?.key || '').toLowerCase();

  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});

  const toggleTeamExpanded = (key: string) => {
    setExpandedTeams((prev) => {
      const isCurrentlyExpanded = prev[key.toUpperCase()] ?? (currentTeamKey.toUpperCase() === key.toUpperCase());
      return {
        ...prev,
        [key.toUpperCase()]: !isCurrentlyExpanded,
      };
    });
  };

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

  if (!organization && (!teams || teams.length === 0)) {
    return <WorkspaceSidebarSkeleton />;
  }

  const navItems: { label: string; href: string; icon: React.ReactNode; badge?: string | number }[] = [
    {
      label: 'Inbox',
      href: effectiveTeamKey ? `/${currentOrgSlug}/${effectiveTeamKey}/inbox` : `/${currentOrgSlug}/inbox`,
      icon: <Inbox className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'My Issues',
      href: effectiveTeamKey ? `/${currentOrgSlug}/${effectiveTeamKey}/my-issues` : `/${currentOrgSlug}/my-issues`,
      icon: <UserCheck className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'AI Assistant',
      href: effectiveTeamKey ? `/${currentOrgSlug}/${effectiveTeamKey}/ai` : `/${currentOrgSlug}/ai`,
      icon: <Sparkles className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'Settings',
      href: `/${currentOrgSlug}/settings/workspace`,
      icon: <Settings className="w-4 h-4 text-zinc-300" />,
    },
  ];

  return (
    <aside className="w-64 h-screen bg-panel-dark border-r border-border-subtle flex flex-col justify-between select-none text-sm z-20 font-sans">
      {/* Workspace Header */}
      <div className="flex flex-col relative">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
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
                  router.push('/workspaces/new');
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Workspace</span>
              </button>
            </div>
          </div>
        )}

        {/* Primary Views */}
        <div className="px-2 py-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.label === 'Settings'
              ? pathname?.includes('/settings')
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-white/[0.08] text-text-primary border border-border-subtle shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-white/[0.08] text-text-primary border border-border-subtle font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Teams Section */}
        {teams.length > 0 && (
          <div className="px-2 py-3 space-y-0.5 border-t border-border-subtle">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
              <span>Teams</span>
              <button
                type="button"
                onClick={() => router.push(`/${currentOrgSlug}/teams/new`)}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Create New Team"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {teams.map((team) => {
              const isTeamActive = currentTeamKey.toUpperCase() === team.key.toUpperCase();
              const isExpanded = !!expandedTeams[team.key.toUpperCase()];
              const issuesHref = `/${currentOrgSlug}/${team.key.toLowerCase()}/issues`;
              const isIssuesActive = pathname?.startsWith(issuesHref);

              return (
                <div key={team.id} className="space-y-0.5">
                  <div
                    onClick={() => toggleTeamExpanded(team.key)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer group select-none ${
                      isTeamActive
                        ? 'text-white font-medium bg-zinc-900/60'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
                          isExpanded ? 'rotate-90 text-zinc-300' : ''
                        }`}
                      />
                      <div
                        className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold shrink-0 ${
                          isTeamActive ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {team.key.slice(0, 2)}
                      </div>
                      <span className="truncate">{team.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono group-hover:text-zinc-400 shrink-0">
                      {team.key}
                    </span>
                  </div>

                  {/* Sub-item: Team > Issues */}
                  {isExpanded && (
                    <div className="pl-6 pr-1 py-0.5 space-y-0.5 animate-fade-in">
                      <Link
                        href={issuesHref}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                          isIssuesActive
                            ? 'bg-zinc-900 text-white font-medium border border-zinc-700/80'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Issues</span>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-[#1a1c21] flex items-center justify-between bg-[#0a0b0c]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <UserAvatar
            name={currentUser?.name}
            email={currentUser?.email}
            avatarUrl={currentUser?.avatar_url}
            size="lg"
          />
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
            href={`/${currentOrgSlug}/settings/workspace`}
            className="p-1.5 rounded-md hover:bg-[#1a1d22] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Settings (Cmd+,)"
          >
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
};
