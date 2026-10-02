'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/sidebar/WorkspaceSidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';
import { IssueDetailDrawer } from '@/components/issues/IssueDetailDrawer';
import { Issue, Organization, Team, User } from '@/types';
import { api } from '@/lib/api';

import { supabase } from '@/lib/supabase/client';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string) || '';

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isAIAskOpen, setIsAIAskOpen] = useState(false);
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [workspaceUsers, setWorkspaceUsers] = useState<User[]>([]);

  useEffect(() => {
    api.getWorkspace(orgSlug).then(setOrganization);
    api.getTeams(orgSlug).then(setTeams);
    api.getWorkspaceMembers(orgSlug).then((members) => {
      const active = (members || [])
        .filter((m) => m.status !== 'invited' && m.user)
        .map((m) => ({
          id: m.user_id,
          name: m.user?.name || m.user?.email || 'Member',
          email: m.user?.email || '',
        }));
      setWorkspaceUsers(active);
    }).catch(() => {});

    // Resolve current user and active session from Supabase auth
    supabase.auth.getSession().then(({ data: { session } }) => {
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
        });
      } else {
        // Fallback placeholder if session is loading or in offline mock
        setCurrentUser({
          id: 'anonymous-user',
          email: 'member@workspace.com',
          name: 'Workspace Member',
        });
      }
    });
  }, [orgSlug]);

  // Global Keyboard Shortcuts (Cmd+K for palette, C for new issue)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsNewIssueOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden font-sans">
      {/* Sidebar with dynamic workspace data */}
      <WorkspaceSidebar
        currentOrgSlug={orgSlug}
        currentTeamKey={teamKey}
        organization={organization}
        teams={teams}
        currentUser={currentUser}
        onOpenCommandPalette={() => setIsCommandOpen(true)}
        onOpenNewIssue={() => setIsNewIssueOpen(true)}
        onOpenAIAsk={() => setIsAIAskOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-black">
        {children}
      </main>

      {/* Modals & Command Palette */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onOpenNewIssue={() => setIsNewIssueOpen(true)}
        onOpenAIAsk={() => setIsAIAskOpen(true)}
        orgSlug={orgSlug}
        currentTeamKey={teamKey}
        teams={teams}
      />

      <AIAssistantModal
        isOpen={isAIAskOpen}
        onClose={() => setIsAIAskOpen(false)}
        currentUser={currentUser}
      />

      <CreateIssueModal
        isOpen={isNewIssueOpen}
        onClose={() => setIsNewIssueOpen(false)}
        teamKey={(teamKey || teams[0]?.key || '').toUpperCase()}
        teamId={teams.find((t) => t.key.toUpperCase() === teamKey.toUpperCase())?.id || teams[0]?.id}
        teams={teams}
        users={workspaceUsers}
        onCreated={(issue) => {
          window.dispatchEvent(new CustomEvent('issueCreated', { detail: issue }));
        }}
      />

      <IssueDetailDrawer
        issue={selectedIssue}
        users={workspaceUsers}
        onClose={() => setSelectedIssue(null)}
        onUpdateIssue={(updated) => {
          setSelectedIssue(updated);
          window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
        }}
      />
    </div>
  );
}
