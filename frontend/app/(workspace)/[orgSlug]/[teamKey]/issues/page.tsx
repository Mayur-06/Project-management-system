'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Issue, WorkflowState, Cycle } from '@/types';
import { Repeat } from 'lucide-react';
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

  const [issues, setIssues] = useState<Issue[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycleFilter, setSelectedCycleFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [initialStateId, setInitialStateId] = useState('');
  // Start false — only flip true inside loadData so the spinner
  // doesn't show before we even know which team to load for.
  const [isLoading, setIsLoading] = useState(false);

  // ─── Load issues, workflow states, and cycles once team is known ───────
  const loadData = async (teamId: string) => {
    setIsLoading(true);
    const [fetchedIssues, fetchedStates, fetchedCycles] = await Promise.all([
      api.getIssues({ teamId }),
      api.getWorkflowStates(teamId),
      api.getCycles(teamId),
    ]);
    setIssues(fetchedIssues);
    setStates(fetchedStates);
    setCycles(fetchedCycles);
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
      setIssues((prev) => {
        if (prev.some((i) => i.id === newIssue.id)) return prev;
        return [newIssue, ...prev];
      });
    },
    onIssueUpdated: (updatedIssue) => {
      setIssues((prev) => prev.map((i) => (i.id === updatedIssue.id ? { ...i, ...updatedIssue } : i)));
    },
    onIssueMoved: ({ id, state_id, sort_order }) => {
      setIssues((prev) =>
        prev.map((i) => (i.id === id ? { ...i, state_id, sort_order } : i))
      );
    },
    onIssueDeleted: (deletedId) => {
      setIssues((prev) => prev.filter((i) => i.id !== deletedId));
    },
    onReloadRequested: () => {
      if (currentTeam?.id) loadData(currentTeam.id);
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
      if (!matchesSearch) return false;
      if (selectedCycleFilter === 'all') return true;
      if (selectedCycleFilter === 'backlog') return !i.cycle_id;
      return i.cycle_id === selectedCycleFilter;
    });
  }, [issues, searchQuery, selectedCycleFilter]);

  // ─── Memoized cycle counts — avoids per-render .filter() in JSX ────────
  const cycleIssueCounts = useMemo(() => {
    const backlogCount = issues.filter((i) => !i.cycle_id).length;
    const perCycle: Record<string, number> = {};
    issues.forEach((i) => {
      if (i.cycle_id) perCycle[i.cycle_id] = (perCycle[i.cycle_id] || 0) + 1;
    });
    return { backlogCount, perCycle };
  }, [issues]);

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
          if (defaultState) setInitialStateId(defaultState.id);
          setIsNewIssueOpen(true);
        }}
      />

      {/* Sprint / Backlog Scope Filter Toolbar */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-zinc-800 bg-[#090a0c] text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedCycleFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
              selectedCycleFilter === 'all'
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            All Issues ({issues.length})
          </button>
          <button
            onClick={() => setSelectedCycleFilter('backlog')}
            className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
              selectedCycleFilter === 'backlog'
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Backlog ({cycleIssueCounts.backlogCount})
          </button>
          {cycles.map((c) => {
            const isSelected = selectedCycleFilter === c.id;
            const count = cycleIssueCounts.perCycle[c.id] || 0;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCycleFilter(c.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Repeat className="w-3 h-3 text-zinc-500" />
                <span>{c.name || `Cycle ${c.number}`}</span>
                <span className="text-[10px] text-zinc-500 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

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
            cycles={cycles}
            users={workspaceUsers}
            onSelectIssue={(issue) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
            }}
            onOpenNewIssueWithState={(stateId) => {
              setInitialStateId(stateId);
              setIsNewIssueOpen(true);
            }}
            onMoveIssueState={handleMoveIssueState}
            onDeleteIssue={handleDeleteIssue}
          />
        ) : (
          <IssueListView
            issues={filteredIssues}
            cycles={cycles}
            users={workspaceUsers}
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
        users={workspaceUsers}
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
