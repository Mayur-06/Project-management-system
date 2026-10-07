'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Issue, WorkflowState, User } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { useRealtimeBoard } from '@/hooks/useRealtime';
import { TopNav } from '@/components/navigation/TopNav';
import { KanbanBoard } from '@/components/issues/KanbanBoard';
import { IssueListView } from '@/components/issues/IssueListView';
import { CreateIssueModal } from '@/components/issues/CreateIssueModal';

export default function IssuesPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  // ─── Workspace data from layout context — no extra API calls needed ───
  const { currentTeam, workspaceUsers, teams: workspaceTeams } = useWorkspace();

  // Map WorkspaceMember[] to User[] for CreateIssueModal
  const modalUsers = useMemo(() => 
    workspaceUsers.map(m => m.user).filter((u): u is User => u !== undefined),
    [workspaceUsers]
  );

  const [issues, setIssues] = useState<Issue[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [initialStateId, setInitialStateId] = useState('');
  // Start false — only flip true inside loadData so the spinner
  // doesn't show before we even know which team to load for.
  const [isLoading, setIsLoading] = useState(false);

  // ─── Active Drag Interruption Guard ──────────────────────────────────────
  // Prevents incoming CDC/Broadcast events from mutating the board while user
  // is actively dragging a card, avoiding DOM detachment or cursor snatching.
  const isDraggingRef = useRef(false);
  const pendingUpdatesRef = useRef<(() => void)[]>([]);

  const queueOrExecute = (updateFn: () => void) => {
    if (isDraggingRef.current) {
      pendingUpdatesRef.current.push(updateFn);
    } else {
      updateFn();
    }
  };

  const handleDragStateChange = (isDragging: boolean) => {
    isDraggingRef.current = isDragging;
    if (!isDragging && pendingUpdatesRef.current.length > 0) {
      const updates = [...pendingUpdatesRef.current];
      pendingUpdatesRef.current = [];
      updates.forEach((fn) => fn());
    }
  };

  // ─── Load issues and workflow states once team is known ───────
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

  // ─── Supabase Realtime Subscription with Self-Echo Suppression ─────────
  useRealtimeBoard({
    teamId: currentTeam?.id,
    onIssueCreated: (newIssue) => {
      queueOrExecute(() => {
        setIssues((prev) => {
          if (prev.some((i) => i.id === newIssue.id)) return prev;
          return [newIssue, ...prev];
        });
      });
    },
    onIssueUpdated: (updatedIssue) => {
      queueOrExecute(() => {
        setIssues((prev) => prev.map((i) => (i.id === updatedIssue.id ? { ...i, ...updatedIssue } : i)));
      });
    },
    onIssueMoved: ({ id, state_id, sort_order }) => {
      queueOrExecute(() => {
        setIssues((prev) =>
          prev.map((i) => (i.id === id ? { ...i, state_id, sort_order } : i))
        );
      });
    },
    onIssueDeleted: (deletedId) => {
      queueOrExecute(() => {
        setIssues((prev) => prev.filter((i) => i.id !== deletedId));
      });
    },
    onReloadRequested: () => {
      queueOrExecute(() => {
        if (currentTeam?.id) loadData(currentTeam.id);
      });
    },
  });

  // ─── Local window events for immediate optimistic feedback ─────────────
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

  // ─── Memoized filtering — recomputes only when inputs change ──────────
  const filteredIssues = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return issues.filter((i) => {
      const matchesSearch =
        i.title.toLowerCase().includes(q) ||
        i.identifier.toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [issues, searchQuery]);

  // ─── Issue actions ─────────────────────────────────────────────────────
  const handleMoveIssueState = async (
    issueId: string,
    newStateId: string,
    prevRank?: string,
    nextRank?: string
  ) => {
    // Clean rank computation without malformed double ':' terminators (H-1B)
    let optimisticRank = '0|h00000:';
    if (prevRank && nextRank) {
      const pClean = prevRank.replace(/^0\|/, '').replace(/:$/, '');
      optimisticRank = `0|${pClean}h:`;
    } else if (prevRank) {
      const pClean = prevRank.replace(/^0\|/, '').replace(/:$/, '');
      optimisticRank = `0|${pClean}h:`;
    } else if (nextRank) {
      const nClean = nextRank.replace(/^0\|/, '').replace(/:$/, '');
      optimisticRank = `0|0${nClean}:`;
    }

    // Optimistic UI update
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, state_id: newStateId, sort_order: optimisticRank } : i))
    );

    // Persist to server and reconcile accurate rank
    const updated = await api.reorderIssue(issueId, newStateId, prevRank, nextRank);
    if (updated) {
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, sort_order: updated.sort_order } : i))
      );
    }
  };

  const handleDeleteIssue = async (issueId: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
    await api.deleteIssue(issueId, true);
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      {/* Top Navigation */}
      <TopNav
        title={`${currentTeam?.key || teamKey || 'Team'} Issues`}
        subtitle={`${filteredIssues.length} active`}
        breadcrumbs={[orgSlug || 'Workspace', currentTeam?.key || teamKey || 'Issues', 'Issues']}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenNewIssue={() => {
          const defaultState = states.find((s) => s.is_default) || states[0];
          const query = defaultState?.id ? `?stateId=${defaultState.id}` : '';
          router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/new${query}`);
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
            users={modalUsers}
            groupBy="none"
            onSelectIssue={(issue) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
            }}
            onOpenNewIssueWithState={(stateId) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/new?stateId=${stateId}`);
            }}
            onAddSubtask={(parentId, stateId) => {
              const query = stateId ? `&stateId=${stateId}` : '';
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/new?parentId=${parentId}${query}`);
            }}
            onMoveIssueState={handleMoveIssueState}
            onDeleteIssue={handleDeleteIssue}
            onDragStateChange={handleDragStateChange}
          />
        ) : (
          <IssueListView
            issues={filteredIssues}
            states={states}
            users={modalUsers}
            onSelectIssue={(issue) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
            }}
          />
        )}
      </div>

      {/* Create Modal */}
      <CreateIssueModal
        isOpen={isNewIssueOpen}
        initialStateId={initialStateId}
        states={states}
        users={modalUsers}
        teamKey={teamKey}
        teamId={currentTeam?.id}
        teams={workspaceTeams}
        onClose={() => setIsNewIssueOpen(false)}
        onCreated={(newIssue) => {
          setIssues((prev) => [newIssue, ...prev]);
        }}
      />
    </div>
  );
}
