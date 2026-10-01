'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Layers,
  Repeat,
  FolderKanban,
  Sparkles,
  Command,
  Plus,
  ChevronDown,
  Settings,
  User as UserIcon,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Organization, Team, User } from '@/types';

interface WorkspaceSidebarProps {
  currentOrgSlug?: string;
  currentTeamKey?: string;
  organization?: Organization | null;
  teams?: Team[];
  currentUser?: User | null;
  triageCount?: number;
  onOpenCommandPalette: () => void;
  onOpenNewIssue: () => void;
  onOpenAIAsk: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  currentOrgSlug = 'acme',
  currentTeamKey = 'ENG',
  organization,
  teams = [],
  currentUser,
  triageCount = 0,
  onOpenCommandPalette,
  onOpenNewIssue,
  onOpenAIAsk,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const orgName = organization?.name || currentOrgSlug.toUpperCase();

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

  const navItems = [
    {
      label: 'Triage Inbox',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/triage`,
      icon: <Inbox className="w-4 h-4 text-zinc-300" />,
      badge: triageCount > 0 ? String(triageCount) : undefined,
    },
    {
      label: 'Issues',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/issues`,
      icon: <Layers className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'Cycles',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/cycles`,
      icon: <Repeat className="w-4 h-4 text-zinc-300" />,
    },
    {
      label: 'Projects',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/projects`,
      icon: <FolderKanban className="w-4 h-4 text-zinc-300" />,
    },
  ];

  return (
    <aside className="w-64 h-screen bg-black border-r border-zinc-800 flex flex-col justify-between select-none text-sm z-20 font-sans">
      {/* Workspace Header */}
      <div className="flex flex-col">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-white text-black flex items-center justify-center font-bold text-xs shadow-xs">
              {orgName.charAt(0)}
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-white">{orgName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </div>
          </div>

          <button
            onClick={onOpenNewIssue}
            className="w-7 h-7 rounded bg-white hover:bg-zinc-200 text-black flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Create Issue (C)"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

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
              <Plus className="w-3 h-3 text-zinc-400 hover:text-white cursor-pointer" />
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
          <button
            className="p-1.5 rounded-md hover:bg-[#1a1d22] text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
