'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { 
  Building2, 
  Users, 
  User, 
  Settings, 
  ArrowLeft,
  FolderKanban,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/WorkspaceContext';

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const { teams, organization } = useWorkspace();

  const handleBackToWorkspace = () => {
    const lastWorkspacePath = typeof window !== 'undefined' ? sessionStorage.getItem('last_workspace_path') : null;
    const defaultTeamKey = teams[0]?.key ? teams[0].key.toLowerCase() : 'eng';
    const fallbackPath = `/${orgSlug}/${defaultTeamKey}/issues`;
    router.push(lastWorkspacePath || fallbackPath);
  };

  // Keyboard shortcut listener: ESC or Cmd+, closes settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleBackToWorkspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orgSlug, teams]);

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

  const isWorkspaceActive = pathname === `/${orgSlug}/settings/workspace` || pathname === `/${orgSlug}/settings`;
  const isMembersActive = pathname?.startsWith(`/${orgSlug}/settings/members`);
  const isTeamsOverviewActive = pathname === `/${orgSlug}/settings/teams`;
  const isProfileActive = pathname?.startsWith(`/${orgSlug}/settings/profile`);

  const getSectionTitle = () => {
    if (isWorkspaceActive) return 'Workspace';
    if (isMembersActive) return 'Members';
    if (isTeamsOverviewActive) return 'Teams';
    if (pathname?.includes('/settings/teams/')) {
      const parts = pathname.split('/');
      const key = parts[parts.length - 1];
      return `Team (${key.toUpperCase()})`;
    }
    if (isProfileActive) return 'Profile';
    return 'Settings';
  };

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden font-sans">
      {/* Dedicated Settings Sidebar */}
      <aside className="w-64 h-screen bg-black border-r border-zinc-800 flex flex-col justify-between select-none text-sm z-20">
        <div className="flex flex-col">
          {/* Header with Back to Workspace Button */}
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
            <button
              onClick={handleBackToWorkspace}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-900/80 px-2 py-1.5 rounded-md transition-colors cursor-pointer group"
              title="Return to Workspace (ESC)"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Workspace</span>
            </button>
            <kbd className="text-[10px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800">
              ESC
            </kbd>
          </div>

          <div className="px-4 py-3 border-b border-zinc-850">
            <h1 className="text-sm font-semibold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-zinc-400" />
              <span>Settings</span>
              {organization?.name && (
                <span className="text-[11px] text-zinc-400 truncate font-normal">
                  • {organization.name}
                </span>
              )}
            </h1>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-1">
            <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Organization
            </div>

            <Link
              href={`/${orgSlug}/settings/workspace`}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                isWorkspaceActive
                  ? 'bg-zinc-900 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Workspace</span>
            </Link>

            <Link
              href={`/${orgSlug}/settings/members`}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                isMembersActive
                  ? 'bg-zinc-900 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Members</span>
            </Link>

            {/* Teams Section */}
            <div className="pt-3 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
              <span>Teams</span>
              <Link
                href={`/${orgSlug}/settings/teams`}
                className="text-[10px] lowercase text-zinc-400 hover:text-zinc-200"
              >
                view all
              </Link>
            </div>

            <Link
              href={`/${orgSlug}/settings/teams`}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                isTeamsOverviewActive
                  ? 'bg-zinc-900 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              <span>Teams Overview</span>
            </Link>

            {teams.map((t) => {
              const isTeamActive = pathname === `/${orgSlug}/settings/teams/${t.key.toLowerCase()}`;
              return (
                <Link
                  key={t.id}
                  href={`/${orgSlug}/settings/teams/${t.key.toLowerCase()}`}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors pl-6 ${
                    isTeamActive
                      ? 'bg-zinc-900 text-white font-medium border border-zinc-700'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    <span className="truncate">{t.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">{t.key}</span>
                </Link>
              );
            })}

            {/* My Account Section */}
            <div className="pt-3 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              My Account
            </div>

            <Link
              href={`/${orgSlug}/settings/profile`}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                isProfileActive
                  ? 'bg-zinc-900 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </Link>
          </nav>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-[#0a0b0c]">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Settings Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-black font-sans">
        {/* Sticky Top Header matching TopNav */}
        <header className="h-14 border-b border-[#1e2025] bg-[#090a0c]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10 select-none shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span onClick={handleBackToWorkspace} className="hover:text-zinc-200 transition-colors cursor-pointer">
                {organization?.name || orgSlug.toUpperCase()}
              </span>
              <ChevronRight className="w-3 h-3 text-zinc-600" />
              <span className="text-zinc-400">Settings</span>
              <ChevronRight className="w-3 h-3 text-zinc-600" />
              <span className="text-white font-medium">{getSectionTitle()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBackToWorkspace}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Workspace</span>
            </button>
          </div>
        </header>

        <div className="max-w-4xl w-full mx-auto p-6 md:p-8 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}