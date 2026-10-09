'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Organization, Team, User, WorkspaceMember } from '@/types';
import { api, setMemoizedToken } from '@/lib/api';
import { WorkspaceContext, WorkspaceContextValue } from '@/lib/WorkspaceContext';
import { supabase } from '@/lib/supabase/client';

export default function OrgRootLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const orgSlug = (params?.orgSlug as string) || '';

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceMember[]>([]);

  // Hydrate from localStorage on client mount (runs on first client tick without SSR mismatch)
  useEffect(() => {
    try {
      const cachedOrg = localStorage.getItem(`pms_org_${orgSlug}`);
      if (cachedOrg) setOrganization(JSON.parse(cachedOrg));
      const cachedTeams = localStorage.getItem(`pms_teams_${orgSlug}`);
      if (cachedTeams) setTeams(JSON.parse(cachedTeams));
      const cachedUser = localStorage.getItem('pms_current_user');
      if (cachedUser) setCurrentUser(JSON.parse(cachedUser));
      const cachedMembers = localStorage.getItem(`pms_members_${orgSlug}`);
      if (cachedMembers) setWorkspaceUsers(JSON.parse(cachedMembers));
    } catch {}
  }, [orgSlug]);

  useEffect(() => {
    let isMounted = true;

    const initWorkspace = async () => {
      // 1. Resolve auth session first to ensure token is ready
      let token = typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        const user = session?.user;
        if (user) {
          if (session.access_token) {
            token = session.access_token;
            setMemoizedToken(session.access_token, session.expires_at);
            if (typeof window !== 'undefined') {
              localStorage.setItem('supabase_access_token', session.access_token);
            }
          }
          const userProfile: User = {
            id: user.id,
            email: user.email || 'user@example.com',
            name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Workspace User',
            avatar_url: (user.user_metadata?.avatar_url as string) || undefined,
            job_description: (user.user_metadata?.job_description as string) || '',
          };
          setCurrentUser(userProfile);
          if (typeof window !== 'undefined') {
            localStorage.setItem('pms_current_user', JSON.stringify(userProfile));
          }
        } else {
          // If unauthenticated, short-circuit and do not make layout calls
          return;
        }
      } catch (err) {
        console.error('Failed to resolve auth session', err);
        return;
      }

      // 2. Fetch workspace resources only after authenticating
      if (orgSlug && token) {
        try {
          const [org, fetchedTeams, members] = await Promise.all([
            api.getWorkspace(orgSlug),
            api.getTeams(orgSlug),
            api.getWorkspaceMembers(orgSlug),
          ]);
          if (!isMounted) return;
          if (org) {
            setOrganization(org);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`pms_org_${orgSlug}`, JSON.stringify(org));
            }
          }
          if (fetchedTeams) {
            setTeams(fetchedTeams);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`pms_teams_${orgSlug}`, JSON.stringify(fetchedTeams));
            }
          }
          const active = (members || []).filter((m) => m.status !== 'invited' && m.user);
          setWorkspaceUsers(active);
          if (typeof window !== 'undefined') {
            localStorage.setItem(`pms_members_${orgSlug}`, JSON.stringify(active));
          }
        } catch (err) {
          console.error('Failed to load workspace data', err);
        }
      }
    };

    initWorkspace();

    return () => {
      isMounted = false;
    };
  }, [orgSlug]);

  // Global Keyboard Shortcuts (Cmd+, / Ctrl+, to open Settings)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        if (pathname?.includes('/settings')) {
          // If already in settings, return to previous or issues
          const lastWorkspacePath = sessionStorage.getItem('last_workspace_path');
          const firstTeam = teams[0]?.key?.toLowerCase() || 'eng';
          router.push(lastWorkspacePath || `/${orgSlug}/${firstTeam}/issues`);
        } else {
          sessionStorage.setItem('last_workspace_path', pathname || `/${orgSlug}/issues`);
          router.push(`/${orgSlug}/settings/workspace`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orgSlug, pathname, router, teams]);

  // Save last workspace path when navigating non-settings pages
  useEffect(() => {
    if (pathname && !pathname.includes('/settings')) {
      sessionStorage.setItem('last_workspace_path', pathname);
    }
  }, [pathname]);

  const defaultTeam = teams[0] || null;

  const contextValue: WorkspaceContextValue = useMemo(
    () => ({
      organization,
      teams,
      currentTeam: defaultTeam,
      workspaceUsers,
      currentUser,
    }),
    [organization, teams, defaultTeam, workspaceUsers, currentUser]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}
