'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/sidebar/WorkspaceSidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';
import { Team, WorkflowState } from '@/types';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function WorkspaceInboxLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';

  const parentContext = useWorkspace();
  const organization = parentContext.organization;
  const teams: Team[] = parentContext.teams || [];
  const currentUser = parentContext.currentUser;
  const workspaceUsers = parentContext.workspaceUsers || [];

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [initialStateId, setInitialStateId] = useState<string>('');
  const [currentTeamStates, setCurrentTeamStates] = useState<WorkflowState[]>([]);

  const defaultTeam = teams[0] || null;
  const defaultTeamKey = defaultTeam?.key?.toLowerCase() || 'eng';

  const handleOpenNewIssue = (stateId?: string) => {
    if (stateId) {
      setInitialStateId(stateId);
    } else {
      const defaultState = currentTeamStates.find((s) => s.is_default) || currentTeamStates[0];
      setInitialStateId(defaultState?.id || '');
    }
    setIsNewIssueOpen(true);
  };

  useEffect(() => {
    const handleOpen = (e: any) => {
      handleOpenNewIssue(e?.detail?.stateId);
    };
    window.addEventListener('openCreateIssue', handleOpen);
    return () => window.removeEventListener('openCreateIssue', handleOpen);
  }, [currentTeamStates]);

  const handleOpenAIAsk = () => {
    router.push(`/${orgSlug}/ai`);
  };

  // Keyboard shortcuts (Cmd+K for palette, C for new issue, Cmd+J for AI Assistant)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }

      if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && !isNewIssueOpen) {
        e.preventDefault();
        handleOpenNewIssue();
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        handleOpenAIAsk();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orgSlug, isNewIssueOpen, currentTeamStates]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#08090a] font-sans">
      {/* Primary Workspace Sidebar */}
      <WorkspaceSidebar
        currentOrgSlug={orgSlug}
        currentTeamKey={defaultTeamKey}
        organization={organization}
        teams={teams}
        currentUser={currentUser}
        onOpenCommandPalette={() => setIsCommandOpen(true)}
        onOpenNewIssue={handleOpenNewIssue}
        onOpenAIAsk={handleOpenAIAsk}
      />

      {/* Main Inbox Application Surface */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#08090a]">
        {children}
      </main>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onOpenNewIssue={handleOpenNewIssue}
        onOpenAIAsk={handleOpenAIAsk}
        orgSlug={orgSlug}
        currentTeamKey={defaultTeamKey}
        teams={teams}
      />

      {/* Create Issue Modal */}
      <CreateIssueModal
        isOpen={isNewIssueOpen}
        initialStateId={initialStateId}
        onClose={() => {
          setIsNewIssueOpen(false);
          setInitialStateId('');
        }}
        teamKey={(defaultTeam?.key || 'ENG').toUpperCase()}
        teamId={defaultTeam?.id}
        teams={teams}
        states={currentTeamStates}
        users={workspaceUsers.filter((m) => m.user).map((m) => m.user!)}
        onCreated={(issue) => {
          window.dispatchEvent(new CustomEvent('issueCreated', { detail: issue }));
        }}
      />
    </div>
  );
}
