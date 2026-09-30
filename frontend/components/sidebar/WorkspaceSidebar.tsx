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
} from 'lucide-react';
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
  const pathname = usePathname();
  const orgName = organization?.name || currentOrgSlug.toUpperCase();

  const navItems = [
    {
      label: 'Triage Inbox',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/triage`,
      icon: <Inbox className="w-4 h-4 text-pink-400" />,
      badge: triageCount > 0 ? String(triageCount) : undefined,
    },
    {
      label: 'Issues',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/issues`,
      icon: <Layers className="w-4 h-4 text-indigo-400" />,
    },
    {
      label: 'Cycles',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/cycles`,
      icon: <Repeat className="w-4 h-4 text-amber-400" />,
    },
    {
      label: 'Projects',
      href: `/${currentOrgSlug}/${currentTeamKey.toLowerCase()}/projects`,
      icon: <FolderKanban className="w-4 h-4 text-emerald-400" />,
    },
  ];

  return (
    <aside className="w-64 h-screen bg-[#0c0d0e] border-r border-[#1e2025] flex flex-col justify-between select-none text-sm z-20">
      {/* Workspace Header */}
      <div className="flex flex-col">
        <div className="p-3 border-b border-[#1a1c21] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-600 to-violet-400 flex items-center justify-center font-bold text-xs text-white shadow-sm">
              {orgName.charAt(0)}
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-zinc-100">{orgName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </div>
          </div>

          <button
            onClick={onOpenNewIssue}
            className="w-7 h-7 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
            title="Create Issue (C)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="p-2 space-y-1">
          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#16181c] border border-transparent hover:border-[#252830] transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Command className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-400" />
              <span>Search & Command</span>
            </div>
            <kbd className="text-[10px] bg-[#1a1d22] text-zinc-400 px-1.5 py-0.5 rounded border border-[#2b2f38]">
              ⌘K
            </kbd>
          </button>

          <button
            onClick={onOpenAIAsk}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-950/30 hover:bg-indigo-950/50 border border-indigo-900/40 hover:border-indigo-800/60 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span className="font-medium">Linear Ask (AI)</span>
            </div>
            <span className="text-[10px] text-indigo-400 bg-indigo-900/60 px-1 rounded">Agent</span>
          </button>
        </div>

        {/* Primary Views */}
        <div className="px-2 py-2 space-y-0.5">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Workspace Views
          </div>
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#1b1e24] text-zinc-100 border border-[#2b2f3a]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#14161a]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-pink-500/20 text-pink-400 border border-pink-500/30 font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Teams Section */}
        {teams.length > 0 && (
          <div className="px-2 py-3 space-y-0.5 border-t border-[#17191d]">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
              <span>Teams</span>
              <Plus className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-pointer" />
            </div>

            {teams.map((team) => {
              const isTeamActive = currentTeamKey.toUpperCase() === team.key.toUpperCase();
              return (
                <Link
                  key={team.id}
                  href={`/${currentOrgSlug}/${team.key.toLowerCase()}/issues`}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isTeamActive
                      ? 'bg-[#181a20] text-zinc-100 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#14161a]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold ${
                        isTeamActive ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {team.key.slice(0, 2)}
                    </div>
                    <span>{team.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">{team.key}</span>
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
        <button
          className="p-1.5 rounded-md hover:bg-[#1a1d22] text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
