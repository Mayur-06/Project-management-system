'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Issue, WorkflowState, User, Label } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { useRealtimeBoard } from '@/hooks/useRealtime';
import { TopNav } from '@/components/navigation/TopNav';
import { KanbanBoard } from '@/components/issues/KanbanBoard';
import { IssueListView } from '@/components/issues/IssueListView';
import { KanbanBoardSkeleton } from '@/components/skeletons/KanbanBoardSkeleton';

function IssuesContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  // ─── Workspace data from layout context ───
  const { currentTeam, workspaceUsers, teams: workspaceTeams, organization } = useWorkspace();

  // Map WorkspaceMember[] to User[] for CreateIssueModal
  const modalUsers = useMemo(() => 
    workspaceUsers.map(m => m.user).filter((u): u is User => u !== undefined),
    [workspaceUsers]
  );

  // Derive resolved team eagerly from URL params matching cached teams or currentTeam
  const resolvedTeam = useMemo(() => {
    if (currentTeam) return currentTeam;
    if (teamKey && workspaceTeams.length > 0) {
      return workspaceTeams.find(t => t.key.toUpperCase() === teamKey) || null;
    }
    return null;
  }, [currentTeam, teamKey, workspaceTeams]);

  // Seed issues and loading state synchronously from in-memory cache
  const [issues, setIssues] = useState<Issue[]>(() => {
    const teamId = resolvedTeam?.id;
    if (teamId) {
      const cached = api.getCachedIssues(teamId);
      if (cached && cached.length > 0) return cached;
    }
    return [];
  });
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  // Persist Horizontal ('parent') vs Vertical ('none') Kanban in localStorage (default to 'none' for flat vertical board)
  const [groupBy, setGroupBy] = useState<'parent' | 'none'>('none');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pms_kanban_groupBy');
      if (saved === 'none' || saved === 'parent') {
        setGroupBy(saved);
      }
    }
  }, []);

  const handleToggleGroupBy = (mode: 'parent' | 'none') => {
    setGroupBy(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pms_kanban_groupBy', mode);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [initialStateId, setInitialStateId] = useState('');
  const [isLoading, setIsLoading] = useState(() => {
    const teamId = resolvedTeam?.id;
    if (teamId) {
      const cached = api.getCachedIssues(teamId);
      if (cached && cached.length > 0) return false;
    }
    return true;
  });

  // ─── Active Drag Interruption Guard ───
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
    const cached = api.getCachedIssues(teamId);
    if (!cached || cached.length === 0) {
      setIsLoading(true);
    }
    try {
      const [fetchedIssues, fetchedStates] = await Promise.all([
        api.getIssues({ teamId }),
        api.getWorkflowStates(teamId),
      ]);
      setIssues(fetchedIssues);
      setStates(fetchedStates);
      if (fetchedStates.length > 0 && !initialStateId) {
        const defaultState = fetchedStates.find((s) => s.is_default) || fetchedStates[0];
        setInitialStateId(defaultState.id);
      }
    } catch (err) {
      console.error('Failed to load issues data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const targetTeamId = resolvedTeam?.id;
    if (targetTeamId) {
      const cached = api.getCachedIssues(targetTeamId);
      if (cached && cached.length > 0) {
        setIssues(cached);
        setIsLoading(false);
      }
      loadData(targetTeamId);
    }
  }, [resolvedTeam?.id]);

  // Load organization labels
  useEffect(() => {
    if (organization?.id) {
      api.getLabels(organization.id).then((lbls) => {
        if (lbls) setAvailableLabels(lbls);
      }).catch(() => {});
    }
  }, [organization?.id]);

  // Listen to issueCreated event
  useEffect(() => {
    const handleCreated = (e: any) => {
      if (e?.detail) {
        setIssues((prev) => {
          if (prev.some((i) => i.id === e.detail.id)) return prev;
          return [e.detail, ...prev];
        });
      }
    };
    window.addEventListener('issueCreated', handleCreated);
    return () => window.removeEventListener('issueCreated', handleCreated);
  }, []);

  // ─── Supabase Realtime Subscription ─────────
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
        setIssues((prev) =>
          prev.map((i) => (i.id === updatedIssue.id ? { ...i, ...updatedIssue } : i))
        );
      });
    },
    onIssueDeleted: (deletedIssueId) => {
      queueOrExecute(() => {
        setIssues((prev) => prev.filter((i) => i.id !== deletedIssueId));
      });
    },
  });

  const filteredIssues = useMemo(() => {
    if (!searchQuery.trim()) return issues;
    const q = searchQuery.toLowerCase();
    return issues.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.identifier.toLowerCase().includes(q)
    );
  }, [issues, searchQuery]);

  const handleMoveIssueState = async (
    issueId: string,
    newStateId: string,
    prevRank?: string,
    nextRank?: string
  ) => {
    const target = issues.find((i) => i.id === issueId);
    if (!target) return;

    let optimisticRank = target.sort_order;
    if (prevRank && nextRank) {
      optimisticRank = `${prevRank}z`;
    } else if (prevRank) {
      optimisticRank = `${prevRank}z`;
    } else if (nextRank) {
      optimisticRank = `0${nextRank}`;
    }

    // Optimistic UI update
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, state_id: newStateId, sort_order: optimisticRank } : i))
    );

    // Persist to server
    const updated = await api.reorderIssue(issueId, newStateId, prevRank, nextRank);
    if (updated) {
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, sort_order: updated.sort_order } : i))
      );
    }
  };

  const handleUpdateIssue = async (
    issueId: string,
    updates: Partial<Issue> & { label_ids?: string[]; expected_version?: number }
  ) => {
    const currentTarget = issues.find((i) => i.id === issueId);
    const expectedVersion = updates.expected_version ?? currentTarget?.version ?? 1;

    // Optimistic UI update
    setIssues((prev) =>
      prev.map((i) => {
        if (i.id !== issueId) return i;
        const patched = { ...i, ...updates, version: expectedVersion + 1 };
        if (updates.state_id) {
          patched.state = states.find((s) => s.id === updates.state_id) || i.state;
        }
        if (updates.label_ids && availableLabels.length > 0) {
          patched.labels = availableLabels.filter((l) => updates.label_ids!.includes(l.id));
        }
        return patched;
      })
    );

    try {
      const updated = await api.updateIssue(issueId, {
        ...updates,
        expected_version: expectedVersion,
      });
      if (updated) {
        setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updated } : i)));
      }
    } catch (err) {
      console.error('Failed to update issue', err);
      // Automatically recover by fetching fresh issue state
      const fresh = await api.getIssue(issueId);
      if (fresh) {
        setIssues((prev) => prev.map((i) => (i.id === issueId ? fresh : i)));
      } else if (currentTeam?.id) {
        loadData(currentTeam.id);
      }
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
        groupBy={groupBy}
        onToggleGroupBy={handleToggleGroupBy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenNewIssue={() => {
          const defaultState = states.find((s) => s.is_default) || states[0];
          window.dispatchEvent(new CustomEvent('openCreateIssue', { detail: { stateId: defaultState?.id } }));
        }}
      />

      {/* Main View Container */}
      <div className="flex-1 overflow-y-auto">
        {isLoading || !currentTeam || states.length === 0 ? (
          viewMode === 'board' ? (
            <KanbanBoardSkeleton />
          ) : (
            <div className="flex items-center justify-center h-64 text-xs text-zinc-500">
              Loading team board...
            </div>
          )
        ) : viewMode === 'board' ? (
          <KanbanBoard
            states={states}
            issues={filteredIssues}
            users={modalUsers}
            availableLabels={availableLabels}
            groupBy={groupBy}
            onSelectIssue={(issue) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
            }}
            onOpenNewIssueWithState={(stateId) => {
              window.dispatchEvent(new CustomEvent('openCreateIssue', { detail: { stateId } }));
            }}
            onAddSubtask={(_parentId, stateId) => {
              window.dispatchEvent(new CustomEvent('openCreateIssue', { detail: { stateId } }));
            }}
            onMoveIssueState={handleMoveIssueState}
            onUpdateIssue={handleUpdateIssue}
            onDeleteIssue={handleDeleteIssue}
            onDragStateChange={handleDragStateChange}
          />
        ) : (
          <IssueListView
            issues={filteredIssues}
            states={states}
            users={modalUsers}
            availableLabels={availableLabels}
            onSelectIssue={(issue) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
            }}
            onUpdateIssue={handleUpdateIssue}
            onDeleteIssue={handleDeleteIssue}
          />
        )}
      </div>
    </div>
  );
}

export default function IssuesPage() {
  return (
    <Suspense fallback={<KanbanBoardSkeleton />}>
      <IssuesContent />
    </Suspense>
  );
}
