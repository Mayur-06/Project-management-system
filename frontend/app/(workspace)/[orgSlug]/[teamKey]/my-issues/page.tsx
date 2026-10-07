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
import { UserCheck, Plus, Layers } from 'lucide-react';

export default function MyIssuesPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const { currentTeam, workspaceUsers, currentUser, teams: workspaceTeams } = useWorkspace();

  const modalUsers = useMemo(
    () => workspaceUsers.map((m) => m.user).filter((u): u is User => u !== undefined),
    [workspaceUsers]
  );

  const [issues, setIssues] = useState<Issue[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [initialStateId, setInitialStateId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  const loadData = async (teamId: string) => {
    setIsLoading(true);
    try {
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
    } catch (err) {
      console.error('Failed to load my issues data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentTeam?.id) {
      loadData(currentTeam.id);
    }
  }, [currentTeam?.id]);

  // Realtime updates
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

  // Local window events for optimistic updates
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

  // Filter issues strictly assigned to current logged-in user
  const myAssignedIssues = useMemo(() => {
    if (!currentUser?.id) return issues;
    return issues.filter((i) => i.assignee_id === currentUser.id);
  }, [issues, currentUser?.id]);

  const filteredIssues = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return myAssignedIssues.filter((i) => {
      return (
        i.title.toLowerCase().includes(q) ||
        i.identifier.toLowerCase().includes(q)
      );
    });
  }, [myAssignedIssues, searchQuery]);

  const handleMoveIssueState = async (
    issueId: string,
    newStateId: string,
    prevRank?: string,
    nextRank?: string
  ) => {
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

    setIssues((prev) =>
      prev.map((i) =>
        i.id === issueId ? { ...i, state_id: newStateId, sort_order: optimisticRank } : i
      )
    );

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
        title="My Issues"
        subtitle={`${filteredIssues.length} assigned to you`}
        breadcrumbs={[orgSlug || 'Workspace', 'My Issues']}
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
            Loading your assigned issues...
          </div>
        ) : filteredIssues.length === 0 && !searchQuery ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center px-4">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-400 shadow-inner">
              <UserCheck className="w-6 h-6 text-zinc-300" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">No issues assigned to you</h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
              You are all caught up! When issues are assigned to you by teammates or created for you, they will appear right here.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues`)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>View Team Issues</span>
              </button>
              <button
                onClick={() => {
                  const defaultState = states.find((s) => s.is_default) || states[0];
                  const query = defaultState?.id ? `?stateId=${defaultState.id}` : '';
                  router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/new${query}`);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Issue</span>
              </button>
            </div>
          </div>
        ) : viewMode === 'board' ? (
          <KanbanBoard
            states={states}
            issues={filteredIssues}
            users={modalUsers}
            onSelectIssue={(issue) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
            }}
            onOpenNewIssueWithState={(stateId) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/new?stateId=${stateId}`);
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
