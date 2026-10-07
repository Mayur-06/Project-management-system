'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/sidebar/WorkspaceSidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';
import { Issue, Organization, Team, User, WorkspaceMember, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { WorkspaceContext, useWorkspace } from '@/lib/WorkspaceContext';
import { supabase } from '@/lib/supabase/client';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string) || '';

  const parentContext = useWorkspace();
  const organization = parentContext.organization;
  const teams: Team[] = parentContext.teams || [];
  const currentUser = parentContext.currentUser;
  const workspaceUsers: WorkspaceMember[] = parentContext.workspaceUsers || [];

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isAIAskOpen, setIsAIAskOpen] = useState(false);
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);

  const handleOpenNewIssue = () => {
    setIsNewIssueOpen(true);
  };

  useEffect(() => {
    const handleOpen = () => setIsNewIssueOpen(true);
    window.addEventListener('openCreateIssue', handleOpen);
    return () => window.removeEventListener('openCreateIssue', handleOpen);
  }, []);

  const handleOpenAIAsk = () => {
    const targetTeam = (teamKey || teams[0]?.key || 'eng').toLowerCase();
    router.push(`/${orgSlug}/${targetTeam}/ai`);
  };

  // Global Keyboard Shortcuts (Cmd+K for palette, C for new issue, Cmd+J for AI Assistant)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        handleOpenAIAsk();
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleOpenNewIssue();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orgSlug, teamKey, teams]);

  const [currentTeamStates, setCurrentTeamStates] = useState<WorkflowState[]>([]);

  // Derive currentTeam from the URL teamKey — no extra API call needed
  const currentTeam = useMemo(
    () => teams.find((t) => t.key.toUpperCase() === teamKey.toUpperCase()) || teams[0] || null,
    [teams, teamKey]
  );

  useEffect(() => {
    if (!currentTeam?.id) return;
    api.getWorkflowStates(currentTeam.id).then((states) => {
      if (states) setCurrentTeamStates(states);
    }).catch(() => {});
  }, [currentTeam?.id]);

  const contextValue = useMemo(
    () => ({ organization, teams, currentTeam, workspaceUsers, currentUser }),
    [organization, teams, currentTeam, workspaceUsers, currentUser]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <div className="flex h-screen w-screen bg-black text-white overflow-hidden font-sans">
        {/* Sidebar with dynamic workspace data */}
        <WorkspaceSidebar
          currentOrgSlug={orgSlug}
          currentTeamKey={teamKey}
          organization={organization}
          teams={teams}
          currentUser={currentUser}
          onOpenCommandPalette={() => setIsCommandOpen(true)}
          onOpenNewIssue={handleOpenNewIssue}
          onOpenAIAsk={handleOpenAIAsk}
        />

        {/* Main View Area */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-black">
          {children}
        </main>

        {/* Modals & Command Palette */}
        <CommandPalette
          isOpen={isCommandOpen}
          onClose={() => setIsCommandOpen(false)}
          onOpenNewIssue={handleOpenNewIssue}
          onOpenAIAsk={handleOpenAIAsk}
          orgSlug={orgSlug}
          currentTeamKey={teamKey}
          teams={teams}
        />

        <AIAssistantModal
          isOpen={isAIAskOpen}
          onClose={() => setIsAIAskOpen(false)}
          currentUser={currentUser}
          organizationId={organization?.id}
        />

        <CreateIssueModal
          isOpen={isNewIssueOpen}
          onClose={() => setIsNewIssueOpen(false)}
          teamKey={(teamKey || teams[0]?.key || '').toUpperCase()}
          teamId={currentTeam?.id || teams[0]?.id}
          teams={teams}
          states={currentTeamStates}
          users={workspaceUsers.filter((m) => m.user).map((m) => m.user!)}
          onCreated={(issue) => {
            window.dispatchEvent(new CustomEvent('issueCreated', { detail: issue }));
          }}
        />
      </div>
    </WorkspaceContext.Provider>
  );
}
