'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Repeat,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRight,
  Flame,
  Plus,
  X,
  Loader2,
  Check,
  AlertCircle,
  Archive,
  Layers,
  Trash2,
  Search,
} from 'lucide-react';
import { Cycle, Issue, CycleMetrics, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { useRealtimeBoard } from '@/hooks/useRealtime';
import { TopNav } from '@/components/navigation/TopNav';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

export default function CyclesPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const [currentTeam, setCurrentTeam] = useState<any>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<Cycle | null>(null);
  const [cycleMetrics, setCycleMetrics] = useState<CycleMetrics | null>(null);
  const [cycleIssues, setCycleIssues] = useState<Issue[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'upcoming' | 'completed'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create Cycle Form State
  const [newCycleName, setNewCycleName] = useState('');
  const [newStartsAt, setNewStartsAt] = useState('');
  const [newEndsAt, setNewEndsAt] = useState('');

  // Complete Cycle Form State
  const [rolloverDestination, setRolloverDestination] = useState<string>('backlog');

  const loadTeamData = async () => {
    setIsLoading(true);
    try {
      const teams = await api.getTeams(orgSlug);
      const matched = teams.find((t) => t.key.toUpperCase() === teamKey) || teams[0];
      if (matched) {
        setCurrentTeam(matched);
        const cycleList = await api.getCycles(matched.id);
        setCycles(cycleList);

        // Determine currently active or first cycle
        const now = new Date();
        const active = cycleList.find((c) => {
          const s = new Date(c.starts_at);
          const e = new Date(c.ends_at);
          return !c.completed_at && s <= now && e >= now;
        }) || cycleList[0] || null;

        setActiveCycle(active);
        if (active) {
          loadCycleDetails(active.id, matched.id);
        }
      }
    } catch (err) {
      console.error('Failed to load team cycles', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCycleDetails = async (cycleId: string, teamId: string) => {
    try {
      const [metrics, issues] = await Promise.all([
        api.getCycleMetrics(cycleId),
        api.getIssues({ teamId, cycleId }),
      ]);
      setCycleMetrics(metrics);
      setCycleIssues(issues);
    } catch (err) {
      console.error('Error fetching cycle metrics', err);
    }
  };

  useEffect(() => {
    loadTeamData();
  }, [orgSlug, teamKey]);

  // Realtime Supabase updates for cycle board
  useRealtimeBoard({
    teamId: currentTeam?.id,
    onIssueCreated: (newIssue) => {
      if (activeCycle?.id && newIssue.cycle_id === activeCycle.id) {
        setCycleIssues((prev) => (prev.some((i) => i.id === newIssue.id) ? prev : [newIssue, ...prev]));
        if (currentTeam?.id) loadCycleDetails(activeCycle.id, currentTeam.id);
      }
    },
    onIssueUpdated: (updatedIssue) => {
      if (!activeCycle?.id) return;
      if (updatedIssue.cycle_id === activeCycle.id) {
        setCycleIssues((prev) => {
          const exists = prev.some((i) => i.id === updatedIssue.id);
          return exists
            ? prev.map((i) => (i.id === updatedIssue.id ? { ...i, ...updatedIssue } : i))
            : [updatedIssue, ...prev];
        });
      } else {
        // If unassigned or moved to another cycle, remove from current sprint list
        setCycleIssues((prev) => prev.filter((i) => i.id !== updatedIssue.id));
      }
      if (currentTeam?.id) loadCycleDetails(activeCycle.id, currentTeam.id);
    },
    onIssueDeleted: (deletedId) => {
      setCycleIssues((prev) => prev.filter((i) => i.id !== deletedId));
      if (activeCycle?.id && currentTeam?.id) loadCycleDetails(activeCycle.id, currentTeam.id);
    },
    onReloadRequested: () => {
      if (activeCycle?.id && currentTeam?.id) {
        loadCycleDetails(activeCycle.id, currentTeam.id);
      }
    },
  });

  // Local window events for instant same-tab responsiveness
  useEffect(() => {
    const handleUpdated = (e: any) => {
      const issue = e.detail;
      if (!activeCycle?.id || !issue) return;
      if (issue.cycle_id === activeCycle.id) {
        setCycleIssues((prev) => {
          const exists = prev.some((i) => i.id === issue.id);
          return exists ? prev.map((i) => (i.id === issue.id ? issue : i)) : [issue, ...prev];
        });
      } else {
        setCycleIssues((prev) => prev.filter((i) => i.id !== issue.id));
      }
      if (currentTeam?.id) loadCycleDetails(activeCycle.id, currentTeam.id);
    };

    const handleDeleted = (e: any) => {
      const deletedId = typeof e.detail === 'string' ? e.detail : e.detail?.id;
      setCycleIssues((prev) => prev.filter((i) => i.id !== deletedId));
      if (activeCycle?.id && currentTeam?.id) loadCycleDetails(activeCycle.id, currentTeam.id);
    };

    window.addEventListener('issueUpdated', handleUpdated);
    window.addEventListener('issueDeleted', handleDeleted);

    return () => {
      window.removeEventListener('issueUpdated', handleUpdated);
      window.removeEventListener('issueDeleted', handleDeleted);
    };
  }, [activeCycle?.id, currentTeam?.id]);

  // Handle selecting a cycle
  const handleSelectCycle = (cycle: Cycle) => {
    setActiveCycle(cycle);
    if (currentTeam?.id) {
      loadCycleDetails(cycle.id, currentTeam.id);
    }
  };

  // Open Create Modal with default dates (2-week cadence)
  const handleOpenCreateModal = () => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 14);

    setNewStartsAt(start.toISOString().split('T')[0]);
    setNewEndsAt(end.toISOString().split('T')[0]);
    const nextNum = (cycles[0]?.number || 0) + 1;
    setNewCycleName(`Cycle ${nextNum}`);
    setActionError(null);
    setIsCreateModalOpen(true);
  };

  // Create Cycle Submit
  const handleCreateCycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam?.id || isSubmitting) return;

    if (!newStartsAt || !newEndsAt) {
      setActionError('Start date and end date are required.');
      return;
    }

    const s = new Date(newStartsAt);
    const eDate = new Date(newEndsAt);
    if (eDate <= s) {
      setActionError('End date must be strictly after start date.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const created = await api.createCycle(currentTeam.id, {
        name: newCycleName.trim() || undefined,
        starts_at: new Date(newStartsAt).toISOString(),
        ends_at: new Date(newEndsAt).toISOString(),
      });

      if (created) {
        setIsCreateModalOpen(false);
        const updatedList = await api.getCycles(currentTeam.id);
        setCycles(updatedList);
        handleSelectCycle(created);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to create sprint cycle.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete Cycle Submit
  const handleCompleteCycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCycle?.id || isSubmitting) return;

    setIsSubmitting(true);
    setActionError(null);

    try {
      const res = await api.completeCycle(activeCycle.id, rolloverDestination);
      if (res) {
        setIsCompleteModalOpen(false);
        if (currentTeam?.id) {
          const updatedList = await api.getCycles(currentTeam.id);
          setCycles(updatedList);
          const nextActive = updatedList.find((c) => !c.completed_at) || updatedList[0] || null;
          setActiveCycle(nextActive);
          if (nextActive) {
            loadCycleDetails(nextActive.id, currentTeam.id);
          }
        }
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to complete sprint cycle.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Cycle Submit
  const handleDeleteCycleSubmit = async () => {
    if (!activeCycle?.id || isSubmitting) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const ok = await api.deleteCycle(activeCycle.id);
      if (ok) {
        setIsDeleteModalOpen(false);
        if (currentTeam?.id) {
          const updatedList = await api.getCycles(currentTeam.id);
          setCycles(updatedList);
          const nextCycle = updatedList[0] || null;
          setActiveCycle(nextCycle);
          if (nextCycle) {
            loadCycleDetails(nextCycle.id, currentTeam.id);
          } else {
            setCycleIssues([]);
            setCycleMetrics(null);
          }
        }
      } else {
        setActionError('Failed to delete cycle.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error deleting cycle.');
    } finally {
      setIsSubmitting(false);
    }
  };


  // Quick remove issue from cycle (return to Backlog)
  const handleRemoveIssueFromCycle = async (issueId: string) => {
    try {
      await api.updateIssue(issueId, { cycle_id: undefined });
      if (activeCycle?.id && currentTeam?.id) {
        loadCycleDetails(activeCycle.id, currentTeam.id);
      }
    } catch (err) {
      console.error('Failed to remove issue from sprint', err);
    }
  };

  // Filter cycles list for tab
  const now = new Date();
  const filteredCycles = cycles.filter((c) => {
    const isCompleted = Boolean(c.completed_at);
    const s = new Date(c.starts_at);
    const e = new Date(c.ends_at);
    const isActive = !isCompleted && s <= now && e >= now;
    const isUpcoming = !isCompleted && s > now;

    if (filterTab === 'active') return isActive;
    if (filterTab === 'upcoming') return isUpcoming;
    if (filterTab === 'completed') return isCompleted;
    return true;
  });

  const isCurrentActive =
    activeCycle &&
    !activeCycle.completed_at &&
    new Date(activeCycle.starts_at) <= now &&
    new Date(activeCycle.ends_at) >= now;

  const totalPts = cycleMetrics?.total_estimate_points || 0;
  const completedPts = cycleMetrics?.completed_estimate_points || 0;
  const progressPercent = cycleMetrics?.completion_percentage || 0;
  const uncompletedIssues = cycleIssues.filter((i) => i.state?.category !== 'completed');

  // Next available cycles for rollover target dropdown
  const otherAvailableCycles = cycles.filter((c) => c.id !== activeCycle?.id && !c.completed_at);

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-black font-sans">
      <TopNav
        title={`${currentTeam?.key || teamKey || 'Team'} Cycles & Velocity`}
        subtitle="Sprint Management & Automated Rollover"
        breadcrumbs={[orgSlug || 'Workspace', currentTeam?.key || teamKey || 'Team', 'Cycles']}
      />

      <div className="flex-1 p-8 overflow-y-auto space-y-6 max-w-6xl mx-auto w-full">
        {/* Header Toolbar: Filter Tabs & Action Buttons */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filterTab === 'all' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Cycles ({cycles.length})
            </button>
            <button
              onClick={() => setFilterTab('active')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filterTab === 'active' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilterTab('upcoming')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filterTab === 'upcoming' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setFilterTab('completed')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filterTab === 'completed' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Completed
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeCycle && (
              <button
                onClick={() => {
                  setActionError(null);
                  setIsDeleteModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-950/40 border border-red-900/50 transition-colors cursor-pointer"
                title="Delete this sprint and return all unfinished issues to Team Backlog"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Sprint</span>
              </button>
            )}

            {activeCycle && !activeCycle.completed_at && (
              <button
                onClick={() => {
                  setActionError(null);
                  setIsCompleteModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Complete Cycle</span>
              </button>
            )}

            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Cycle</span>
            </button>
          </div>
        </div>

        {/* Cycles Selector Strip */}
        {cycles.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {filteredCycles.map((cycle) => {
              const isSelected = activeCycle?.id === cycle.id;
              const isDone = Boolean(cycle.completed_at);
              return (
                <button
                  key={cycle.id}
                  onClick={() => handleSelectCycle(cycle)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 border-zinc-600 text-white font-medium shadow-xs'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <Repeat className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-zinc-500'}`} />
                  <span>{cycle.name || `Cycle ${cycle.number}`}</span>
                  {isDone && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                      Done
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Cycle Hero Card */}
        {activeCycle ? (
          <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-800 space-y-6 shadow-xs">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mb-1">
                  {isCurrentActive ? (
                    <>
                      <Flame className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400 font-bold">CURRENT ACTIVE SPRINT</span>
                    </>
                  ) : activeCycle.completed_at ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">COMPLETED SPRINT</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-zinc-400" />
                      <span>UPCOMING SPRINT</span>
                    </>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-white">{activeCycle.name || `Cycle ${activeCycle.number}`}</h2>
                <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    {new Date(activeCycle.starts_at).toLocaleDateString()} –{' '}
                    {new Date(activeCycle.ends_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-3xl font-mono font-bold text-white">{progressPercent}%</div>
                <div className="text-xs text-zinc-400">
                  {completedPts} / {totalPts} points completed
                </div>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                <span>Scope: {totalPts} pts</span>
                <span>Completed: {completedPts} pts</span>
                <span>Remaining: {Math.max(0, totalPts - completedPts)} pts</span>
              </div>
            </div>

            {/* Velocity & Burnup Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-zinc-800">
              <div className="p-3 bg-black rounded border border-zinc-800">
                <span className="text-[11px] text-zinc-400 block mb-1">Total Issues</span>
                <span className="text-lg font-bold text-white font-mono">{cycleMetrics?.total_issues ?? cycleIssues.length}</span>
              </div>
              <div className="p-3 bg-black rounded border border-zinc-800">
                <span className="text-[11px] text-zinc-400 block mb-1">Completed Issues</span>
                <span className="text-lg font-bold text-white font-mono text-emerald-400">
                  {cycleMetrics?.completed_issues ?? cycleIssues.filter((i) => i.state?.category === 'completed').length}
                </span>
              </div>
              <div className="p-3 bg-black rounded border border-zinc-800">
                <span className="text-[11px] text-zinc-400 block mb-1">Remaining Scope</span>
                <span className="text-lg font-bold text-zinc-300 font-mono">
                  {Math.max(0, totalPts - completedPts)} pts ({uncompletedIssues.length} issues)
                </span>
              </div>
              <div className="p-3 bg-black rounded border border-zinc-800">
                <span className="text-[11px] text-zinc-400 block mb-1">Status</span>
                <span className="text-lg font-bold text-white font-mono">
                  {activeCycle.completed_at ? 'Closed' : isCurrentActive ? 'Active' : 'Scheduled'}
                </span>
              </div>
            </div>

            {/* Burnup Visualization Indicator */}
            {cycleMetrics?.burnup_data && cycleMetrics.burnup_data.length > 0 && (
              <div className="p-3 bg-black/60 rounded border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">Sprint Trajectory</span>
                  <span className="font-mono text-[11px]">
                    {completedPts >= totalPts && totalPts > 0 ? '✓ On Target' : `${Math.round(progressPercent)}% Velocity`}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white" />
                    <span>Completed Points ({completedPts})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
                    <span>Total Target ({totalPts})</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-12 text-center rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <Repeat className="w-8 h-8 text-zinc-600 mx-auto" />
            <h3 className="text-sm font-semibold text-white">No sprint cycles found</h3>
            <p className="text-xs text-zinc-400">Create your team&apos;s first sprint cycle to track sprint velocity and burnup.</p>
            <button
              onClick={handleOpenCreateModal}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Create Sprint Cycle
            </button>
          </div>
        )}

        {/* Issues in Selected Cycle List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <span>Issues in {activeCycle?.name || 'Selected Sprint'}</span>
              <span className="text-zinc-500 font-mono">({cycleIssues.length})</span>
            </h3>
          </div>

          <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
            {cycleIssues.length > 0 ? (
              cycleIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => {
                    router.push(`/${orgSlug}/${teamKey.toLowerCase()}/issues/${issue.identifier}`);
                  }}
                  className="p-3.5 flex items-center justify-between hover:bg-zinc-900 transition-colors text-xs cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-medium text-white group-hover:text-zinc-200">{issue.identifier}</span>
                    <span className="text-white font-medium truncate group-hover:text-zinc-100">{issue.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StateBadge state={issue.state} />
                    <PriorityBadge priority={issue.priority} />
                    <span className="font-mono text-zinc-400">{issue.estimate || 1} pts</span>
                    {activeCycle && !activeCycle.completed_at && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleRemoveIssueFromCycle(issue.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-amber-400 transition-all rounded hover:bg-zinc-800 cursor-pointer"
                        title="Remove from sprint (return to backlog)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500">
                No issues allocated to this sprint yet. You can assign issues to this cycle from the issue detail view.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1. Create Cycle Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-white">Create Sprint Cycle</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCycleSubmit} className="p-5 space-y-4 text-xs">
              {actionError && (
                <div className="p-2.5 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div>
                <label className="block text-zinc-400 mb-1">Cycle Name</label>
                <input
                  type="text"
                  value={newCycleName}
                  onChange={(e) => setNewCycleName(e.target.value)}
                  placeholder="e.g. Cycle 4"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newStartsAt}
                    onChange={(e) => setNewStartsAt(e.target.value)}
                    required
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newEndsAt}
                    onChange={(e) => setNewEndsAt(e.target.value)}
                    required
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg font-semibold text-black bg-white hover:bg-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Cycle</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Complete Cycle & Rollover Modal */}
      {isCompleteModalOpen && activeCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Complete & Rollover Sprint</h3>
              </div>
              <button
                onClick={() => setIsCompleteModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteCycleSubmit} className="p-5 space-y-4 text-xs">
              {actionError && (
                <div className="p-2.5 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-white font-medium">Closing: {activeCycle.name || `Cycle ${activeCycle.number}`}</p>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  There are <span className="text-white font-semibold">{uncompletedIssues.length} incomplete issues</span> in this sprint. Where would you like to rollover this unfinished work?
                </p>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 font-medium">Rollover Destination</label>
                <div className="space-y-2">
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      rolloverDestination === 'backlog'
                        ? 'bg-zinc-900 border-zinc-600 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="destination"
                      value="backlog"
                      checked={rolloverDestination === 'backlog'}
                      onChange={() => setRolloverDestination('backlog')}
                      className="hidden"
                    />
                    <Archive className="w-4 h-4 text-zinc-400" />
                    <div>
                      <div className="font-medium text-xs">Team Backlog</div>
                      <div className="text-[10px] text-zinc-500">Unassign cycle and return issues to active backlog</div>
                    </div>
                  </label>

                  {otherAvailableCycles.map((target) => (
                    <label
                      key={target.id}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                        rolloverDestination === target.id
                          ? 'bg-zinc-900 border-zinc-600 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="destination"
                        value={target.id}
                        checked={rolloverDestination === target.id}
                        onChange={() => setRolloverDestination(target.id)}
                        className="hidden"
                      />
                      <Repeat className="w-4 h-4 text-zinc-400" />
                      <div>
                        <div className="font-medium text-xs">{target.name || `Cycle ${target.number}`}</div>
                        <div className="text-[10px] text-zinc-500">
                          Transfer directly into upcoming sprint ({new Date(target.starts_at).toLocaleDateString()})
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg font-semibold text-black bg-white hover:bg-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Completing...</span>
                    </>
                  ) : (
                    <span>Complete Sprint</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Delete Sprint Confirmation Modal */}
      {isDeleteModalOpen && activeCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-red-950/20">
              <div className="flex items-center gap-2 text-red-400">
                <Trash2 className="w-4 h-4" />
                <h3 className="text-sm font-semibold text-white">
                  Delete {activeCycle.name || `Cycle ${activeCycle.number}`}?
                </h3>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {actionError && (
                <div className="p-2.5 rounded bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <p className="text-zinc-300 leading-relaxed">
                Are you sure you want to delete this sprint?
              </p>

              <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-400 space-y-1.5">
                <div className="flex items-center gap-2 text-white font-medium">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Automatic Return to Backlog:</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  All <strong className="text-white">{cycleIssues.length} issues</strong> assigned to this sprint will be safely unassigned, and any unfinished issues will be automatically returned to your team&apos;s <strong className="text-white">Backlog</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCycleSubmit}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-500 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete & Return to Backlog</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
