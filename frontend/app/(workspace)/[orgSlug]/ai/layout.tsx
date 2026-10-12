'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/sidebar/WorkspaceSidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';
import { Team, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [initialStateId, setInitialStateId] = useState<string>('');
  const [currentTeamStates, setCurrentTeamStates] = useState<WorkflowState[]>([]);

  useEffect(() => {
    const handleOpenMobile = () => setIsMobileNavOpen(true);
    window.addEventListener('openMobileNav', handleOpenMobile);
    return () => window.removeEventListener('openMobileNav', handleOpenMobile);
  }, []);

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
      {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
      <div className="hidden md:flex shrink-0 h-full">
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
      </div>

      {/* Mobile Navigation Drawer Sheet */}
      <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-[#0f1011] border-r border-white/[0.08] [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
            <SheetDescription>Workspace navigation sidebar</SheetDescription>
          </SheetHeader>
          <WorkspaceSidebar
            currentOrgSlug={orgSlug}
            currentTeamKey={defaultTeamKey}
            organization={organization}
            teams={teams}
            currentUser={currentUser}
            onOpenCommandPalette={() => {
              setIsMobileNavOpen(false);
              setIsCommandOpen(true);
            }}
            onOpenNewIssue={() => {
              setIsMobileNavOpen(false);
              handleOpenNewIssue();
            }}
            onOpenAIAsk={() => {
              setIsMobileNavOpen(false);
              handleOpenAIAsk();
            }}
            onNavigate={() => setIsMobileNavOpen(false)}
            onCloseMobile={() => setIsMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

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
