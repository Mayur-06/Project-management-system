'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Issue, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { KanbanBoard } from '@/components/issues/KanbanBoard';
import { IssueListView } from '@/components/issues/IssueListView';
import { IssueDetailDrawer } from '@/components/issues/IssueDetailDrawer';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';

export default function IssuesPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || 'acme';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || 'ENG';

  const [issues, setIssues] = useState<Issue[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [initialStateId, setInitialStateId] = useState('st_todo');
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    const [fetchedIssues, fetchedStates] = await Promise.all([
      api.getIssues({ teamId: `team_${teamKey.toLowerCase()}` }),
      api.getWorkflowStates(`team_${teamKey.toLowerCase()}`),
    ]);
    setIssues(fetchedIssues);
    setStates(fetchedStates);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();

    const handleCreated = (e: any) => {
      setIssues((prev) => [e.detail, ...prev]);
    };
    const handleUpdated = (e: any) => {
      setIssues((prev) => prev.map((i) => (i.id === e.detail.id ? e.detail : i)));
    };

    window.addEventListener('issueCreated', handleCreated);
    window.addEventListener('issueUpdated', handleUpdated);

    return () => {
      window.removeEventListener('issueCreated', handleCreated);
      window.removeEventListener('issueUpdated', handleUpdated);
    };
  }, [teamKey]);

  const filteredIssues = issues.filter(
    (i) =>
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.identifier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleMoveIssueState = async (issueId: string, newStateId: string) => {
    // Optimistic UI update
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, state_id: newStateId } : i))
    );
    await api.reorderIssue(issueId, newStateId, '0|new:');
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      {/* Top Navigation */}
      <TopNav
        title={`${teamKey} Issues`}
        subtitle={`${filteredIssues.length} active`}
        breadcrumbs={['Acme Corp', teamKey, 'Issues']}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenNewIssue={() => {
          setInitialStateId('st_todo');
          setIsNewIssueOpen(true);
        }}
      />

      {/* Main View Container */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-xs text-zinc-500">
            Loading team board...
          </div>
        ) : viewMode === 'board' ? (
          <KanbanBoard
            states={states}
            issues={filteredIssues}
            onSelectIssue={setSelectedIssue}
            onOpenNewIssueWithState={(stateId) => {
              setInitialStateId(stateId);
              setIsNewIssueOpen(true);
            }}
            onMoveIssueState={handleMoveIssueState}
          />
        ) : (
          <IssueListView issues={filteredIssues} onSelectIssue={setSelectedIssue} />
        )}
      </div>

      {/* Issue Detail Drawer */}
      <IssueDetailDrawer
        issue={selectedIssue}
        states={states}
        onClose={() => setSelectedIssue(null)}
        onUpdateIssue={(updated) => {
          setSelectedIssue(updated);
          setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        }}
      />

      {/* Create Modal */}
      <CreateIssueModal
        isOpen={isNewIssueOpen}
        initialStateId={initialStateId}
        states={states}
        teamKey={teamKey}
        onClose={() => setIsNewIssueOpen(false)}
        onCreated={(newIssue) => {
          setIssues((prev) => [newIssue, ...prev]);
        }}
      />
    </div>
  );
}
