'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Organization, Team, User, WorkspaceMember } from '@/types';
import { api } from '@/lib/api';
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

  useEffect(() => {
    let isMounted = true;

    // Resolve auth session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      const user = session?.user;
      if (user) {
        if (session.access_token && typeof window !== 'undefined') {
          localStorage.setItem('supabase_access_token', session.access_token);
        }
        setCurrentUser({
          id: user.id,
          email: user.email || 'user@example.com',
          name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Workspace User',
          avatar_url: (user.user_metadata?.avatar_url as string) || undefined,
          job_description: (user.user_metadata?.job_description as string) || '',
        });
      } else {
        setCurrentUser({
          id: 'anonymous-user',
          email: 'member@workspace.com',
          name: 'Workspace Member',
          job_description: '',
        });
      }
    }).then(() => {
      if (!orgSlug) return;
      // Parallel workspace-level fetches
      Promise.all([
        api.getWorkspace(orgSlug),
        api.getTeams(orgSlug),
        api.getWorkspaceMembers(orgSlug),
      ]).then(([org, fetchedTeams, members]) => {
        if (!isMounted) return;
        if (org) setOrganization(org);
        if (fetchedTeams) setTeams(fetchedTeams);
        const active = (members || []).filter((m) => m.status !== 'invited' && m.user);
        setWorkspaceUsers(active);
      }).catch((err) => {
        console.error('Failed to load workspace data', err);
      });
    });

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
