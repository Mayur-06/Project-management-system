'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Issue, WorkflowState, User, Label } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { useRealtimeBoard } from '@/hooks/useRealtime';
import { TopNav } from '@/components/navigation/TopNav';
import { KanbanBoard } from '@/components/issues/KanbanBoard';
import { IssueListView } from '@/components/issues/IssueListView';
import { Button } from '@/components/ui/button';
import { UserCheck, Plus, Layers } from 'lucide-react';

export default function MyIssuesPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const { organization, currentTeam, workspaceUsers, currentUser, teams: workspaceTeams } = useWorkspace();

  const modalUsers = useMemo(
    () => workspaceUsers.map((m) => m.user).filter((u): u is User => u !== undefined),
    [workspaceUsers]
  );

  // Derive resolved team eagerly
  const resolvedTeam = useMemo(() => {
    if (currentTeam) return currentTeam;
    if (teamKey && workspaceTeams.length > 0) {
      return workspaceTeams.find(t => t.key.toUpperCase() === teamKey) || null;
    }
    return null;
  }, [currentTeam, teamKey, workspaceTeams]);

  // Seed issues synchronously from in-memory cache
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

  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(() => {
    const teamId = resolvedTeam?.id;
    if (teamId) {
      const cached = api.getCachedIssues(teamId);
      if (cached && cached.length > 0) return false;
    }
    return false;
  });

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
    const cached = api.getCachedIssues(teamId);
    if (!cached || cached.length === 0) {
      setIsLoading(true);
    }
    try {
      const [fetchedIssues, fetchedStates, fetchedLabels] = await Promise.all([
        api.getIssues({ teamId }),
        api.getWorkflowStates(teamId),
        organization?.id ? api.getLabels(organization.id) : Promise.resolve([]),
      ]);
      setIssues(fetchedIssues);
      setStates(fetchedStates);
      setAvailableLabels(fetchedLabels || []);
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

    const target = issues.find((i) => i.id === issueId);
    const targetState = states.find((s) => s.id === newStateId) || target?.state;

    setIssues((prev) =>
      prev.map((i) =>
        i.id === issueId
          ? { ...i, state_id: newStateId, state: targetState, sort_order: optimisticRank }
          : i
      )
    );

    const updated = await api.reorderIssue(issueId, newStateId, prevRank, nextRank);
    if (updated) {
      setIssues((prev) =>
        prev.map((i) =>
          i.id === issueId
            ? {
                ...i,
                sort_order: updated.sort_order,
                state_id: updated.state_id || newStateId,
                state: targetState,
                version: updated.version || i.version,
              }
            : i
        )
      );
    }
  };

  const handleDeleteIssue = async (issueId: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
    await api.deleteIssue(issueId, true);
  };

  const handleUpdateIssue = async (
    issueId: string,
    updates: Partial<Issue> & { label_ids?: string[] }
  ) => {
    setIssues((prev) =>
      prev.map((i) => {
        if (i.id !== issueId) return i;
        const patched = { ...i, ...updates };
        if (updates.state_id) {
          patched.state = states.find((s) => s.id === updates.state_id) || i.state;
        }
        if (updates.label_ids && availableLabels.length > 0) {
          patched.labels = availableLabels.filter((l) => updates.label_ids!.includes(l.id));
        }
        return patched;
      })
    );
    await api.updateIssue(issueId, updates);
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
          window.dispatchEvent(
            new CustomEvent('openCreateIssue', { detail: { stateId: defaultState?.id } })
          );
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues`)}
                className="gap-2 text-xs bg-panel-dark hover:bg-surface-elevated border-border-subtle hover:border-border-hover text-text-secondary hover:text-text-primary"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>View Team Issues</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const defaultState = states.find((s) => s.is_default) || states[0];
                  window.dispatchEvent(
                    new CustomEvent('openCreateIssue', { detail: { stateId: defaultState?.id } })
                  );
                }}
                className="gap-1.5 text-xs font-medium bg-brand-primary hover:bg-brand-hover text-white shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Issue</span>
              </Button>
            </div>
          </div>
        ) : viewMode === 'board' ? (
          <KanbanBoard
            states={states}
            issues={filteredIssues}
            users={modalUsers}
            availableLabels={availableLabels}
            groupBy="none"
            onSelectIssue={(issue) => {
              router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
            }}
            onOpenNewIssueWithState={(stateId) => {
              window.dispatchEvent(
                new CustomEvent('openCreateIssue', { detail: { stateId } })
              );
            }}
            onAddSubtask={(_parentId, stateId) => {
              window.dispatchEvent(
                new CustomEvent('openCreateIssue', { detail: { stateId } })
              );
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
