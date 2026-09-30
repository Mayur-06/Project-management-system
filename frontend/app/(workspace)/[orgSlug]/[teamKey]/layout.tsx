'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { WorkspaceSidebar } from '@/components/sidebar/WorkspaceSidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { LinearAskModal } from '@/components/ai/LinearAskModal';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';
import { IssueDetailDrawer } from '@/components/issues/IssueDetailDrawer';
import { Issue, Organization, Team, User } from '@/types';
import { api } from '@/lib/api';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || 'acme';
  const teamKey = (params?.teamKey as string) || 'eng';

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isAIAskOpen, setIsAIAskOpen] = useState(false);
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  useEffect(() => {
    api.getWorkspace(orgSlug).then(setOrganization);
    api.getTeams(orgSlug).then(setTeams);
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
    <div className="flex h-screen w-screen bg-[#08090a] text-zinc-100 overflow-hidden font-sans">
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
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-[#08090a]">
        {children}
      </main>

      {/* Modals & Command Palette */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onOpenNewIssue={() => setIsNewIssueOpen(true)}
        onOpenAIAsk={() => setIsAIAskOpen(true)}
        orgSlug={orgSlug}
        teams={teams}
      />

      <LinearAskModal
        isOpen={isAIAskOpen}
        onClose={() => setIsAIAskOpen(false)}
        currentUser={currentUser}
      />

      <CreateIssueModal
        isOpen={isNewIssueOpen}
        onClose={() => setIsNewIssueOpen(false)}
        teamKey={teamKey.toUpperCase()}
        onCreated={(issue) => {
          window.dispatchEvent(new CustomEvent('issueCreated', { detail: issue }));
        }}
      />

      <IssueDetailDrawer
        issue={selectedIssue}
        onClose={() => setSelectedIssue(null)}
        onUpdateIssue={(updated) => {
          setSelectedIssue(updated);
          window.dispatchEvent(new CustomEvent('issueUpdated', { detail: updated }));
        }}
      />
    </div>
  );
}
