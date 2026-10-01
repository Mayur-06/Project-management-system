'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Issue, WorkflowState, Team } from '@/types';
import { api } from '@/lib/api';
import { useRealtimeBoard } from '@/hooks/useRealtime';
import { TopNav } from '@/components/navigation/TopNav';
import { KanbanBoard } from '@/components/issues/KanbanBoard';
import { IssueListView } from '@/components/issues/IssueListView';
import { IssueDetailDrawer } from '@/components/issues/IssueDetailDrawer';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';

export default function IssuesPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || 'acme';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || 'ENG';

  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [initialStateId, setInitialStateId] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 1. Resolve active team dynamically
  useEffect(() => {
    let isMounted = true;
    api.getTeams(orgSlug).then((teams) => {
      if (!isMounted) return;
      const matched = teams.find((t) => t.key.toUpperCase() === teamKey);
      const team = matched || teams[0] || null;
      setCurrentTeam(team);
    });
    return () => {
      isMounted = false;
    };
  }, [orgSlug, teamKey]);

  // 2. Load issues and workflow states for resolved team
  const loadData = async (teamId: string) => {
    setIsLoading(true);
    const [fetchedIssues, fetchedStates] = await Promise.all([
      api.getIssues({ teamId }),
      api.getWorkflowStates(teamId),
    ]);
    setIssues(fetchedIssues);
    setStates(fetchedStates);
    if (fetchedStates.length > 0) {
      const defaultState = fetchedStates.find((s) => s.is_default) || fetchedStates[0];
      setInitialStateId(defaultState.id);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (currentTeam?.id) {
      loadData(currentTeam.id);
    }
  }, [currentTeam?.id]);

  // 3. Supabase Realtime Subscription with Self-Echo Suppression
  useRealtimeBoard({
    teamId: currentTeam?.id,
    onIssueCreated: (newIssue) => {
      setIssues((prev) => {
        if (prev.some((i) => i.id === newIssue.id)) return prev;
        return [newIssue, ...prev];
      });
    },
    onIssueUpdated: (updatedIssue) => {
      setIssues((prev) => prev.map((i) => (i.id === updatedIssue.id ? { ...i, ...updatedIssue } : i)));
      setSelectedIssue((prev) => (prev?.id === updatedIssue.id ? { ...prev, ...updatedIssue } : prev));
    },
    onIssueMoved: ({ id, state_id, sort_order }) => {
      setIssues((prev) =>
        prev.map((i) => (i.id === id ? { ...i, state_id, sort_order } : i))
      );
    },
    onIssueDeleted: (deletedId) => {
      setIssues((prev) => prev.filter((i) => i.id !== deletedId));
      setSelectedIssue((prev) => (prev?.id === deletedId ? null : prev));
    },
    onReloadRequested: () => {
      if (currentTeam?.id) loadData(currentTeam.id);
    },
  });

  // Local window event listeners for synchronous immediate feedback
  useEffect(() => {
    const handleCreated = (e: any) => {
      setIssues((prev) => {
        if (prev.some((i) => i.id === e.detail.id)) return prev;
        return [e.detail, ...prev];
      });
    };
    const handleUpdated = (e: any) => {
      setIssues((prev) => prev.map((i) => (i.id === e.detail.id ? e.detail : i)));
    };
    const handleDeleted = (e: any) => {
      const deletedId = typeof e.detail === 'string' ? e.detail : e.detail?.id;
      setIssues((prev) => prev.filter((i) => i.id !== deletedId));
      setSelectedIssue((prev) => (prev?.id === deletedId ? null : prev));
    };

    window.addEventListener('issueCreated', handleCreated);
    window.addEventListener('issueUpdated', handleUpdated);
    window.addEventListener('issueDeleted', handleDeleted);

    return () => {
      window.removeEventListener('issueCreated', handleCreated);
      window.removeEventListener('issueUpdated', handleUpdated);
      window.removeEventListener('issueDeleted', handleDeleted);
    };
  }, []);

  const filteredIssues = issues.filter(
    (i) =>
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.identifier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleMoveIssueState = async (
    issueId: string,
    newStateId: string,
    prevRank?: string,
    nextRank?: string
  ) => {
    let newRank = '0|h00000:';
    if (prevRank && nextRank) {
      newRank = `${prevRank.slice(0, 4)}${Date.now() % 1000}:`;
    } else if (prevRank) {
      newRank = `${prevRank}1:`;
    } else if (nextRank) {
      newRank = `0|0${Date.now() % 100}:`;
    }

    // Optimistic UI update
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, state_id: newStateId, sort_order: newRank } : i))
    );
    await api.reorderIssue(issueId, newStateId, newRank);
  };

  const handleDeleteIssue = async (issueId: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
    if (selectedIssue?.id === issueId) setSelectedIssue(null);
    await api.deleteIssue(issueId, true);
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
          const defaultState = states.find((s) => s.is_default) || states[0];
          if (defaultState) setInitialStateId(defaultState.id);
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
            onDeleteIssue={handleDeleteIssue}
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
          setIssues((prev) => {
            let next = prev.map((i) => (i.id === updated.id ? updated : i));
            if (updated.subtasks && updated.subtasks.length > 0) {
              const existingIds = new Set(next.map((i) => i.id));
              const newSubs = updated.subtasks.filter((s) => !existingIds.has(s.id));
              if (newSubs.length > 0) {
                next = [...newSubs, ...next];
              }
            }
            return next;
          });
        }}
      />

      {/* Create Modal */}
      <CreateIssueModal
        isOpen={isNewIssueOpen}
        initialStateId={initialStateId}
        states={states}
        teamKey={teamKey}
        teamId={currentTeam?.id}
        onClose={() => setIsNewIssueOpen(false)}
        onCreated={(newIssue) => {
          setIssues((prev) => [newIssue, ...prev]);
        }}
      />
    </div>
  );
}
