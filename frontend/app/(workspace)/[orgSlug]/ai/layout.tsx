'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/sidebar/WorkspaceSidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';
import { Team, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function WorkspaceAILayout({ children }: { children: React.ReactNode }) {
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

  // Keyboard shortcuts (Cmd+K for palette, C for new issue, Cmd+J for AI Copilot)
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
  }, [orgSlug, teams, currentTeamStates]);

  useEffect(() => {
    if (!defaultTeam?.id) return;
    api.getWorkflowStates(defaultTeam.id).then((states) => {
      if (states) setCurrentTeamStates(states);
    }).catch(() => {});
  }, [defaultTeam?.id]);

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden font-sans">
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

      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#08090a]">
        {children}
      </main>

      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onOpenNewIssue={handleOpenNewIssue}
        onOpenAIAsk={handleOpenAIAsk}
        orgSlug={orgSlug}
        currentTeamKey={defaultTeamKey}
        teams={teams}
      />

      <CreateIssueModal
        isOpen={isNewIssueOpen}
        initialStateId={initialStateId}
        onClose={() => {
          setIsNewIssueOpen(false);
          setInitialStateId('');
        }}
        teamKey={(defaultTeam?.key || '').toUpperCase()}
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
