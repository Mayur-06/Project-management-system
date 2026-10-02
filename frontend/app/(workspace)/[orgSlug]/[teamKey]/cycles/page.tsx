'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Repeat,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { Cycle, Issue } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

export default function CyclesPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const [currentTeam, setCurrentTeam] = useState<any>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleIssues, setCycleIssues] = useState<Issue[]>([]);
  const [activeCycle, setActiveCycle] = useState<Cycle | null>(null);

  useEffect(() => {
    let isMounted = true;
    api.getTeams(orgSlug).then((teams) => {
      if (!isMounted) return;
      const matched = teams.find((t) => t.key.toUpperCase() === teamKey) || teams[0];
      if (matched) {
        setCurrentTeam(matched);
        api.getCycles(matched.id).then((res) => {
          if (!isMounted) return;
          setCycles(res);
          if (res.length > 0) {
            setActiveCycle(res[0]);
            api.getIssues({ teamId: matched.id, cycleId: res[0].id }).then((iss) => {
              if (isMounted) setCycleIssues(iss);
            });
          } else {
            api.getIssues({ teamId: matched.id }).then((iss) => {
              if (isMounted) setCycleIssues(iss.slice(0, 10));
            });
          }
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [orgSlug, teamKey]);

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      <TopNav
        title={`${currentTeam?.key || teamKey || 'Team'} Cycles & Velocity`}
        subtitle="Sprint Management"
        breadcrumbs={[orgSlug || 'Workspace', currentTeam?.key || teamKey || 'Cycles', 'Cycles']}
      />

      <div className="flex-1 p-8 overflow-y-auto space-y-8 max-w-6xl mx-auto w-full font-sans">
        {/* Active Cycle Hero Card */}
        {activeCycle && (
          <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-800 space-y-6 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mb-1">
                  <Flame className="w-4 h-4 text-white" />
                  <span>CURRENT ACTIVE SPRINT</span>
                </div>
                <h2 className="text-2xl font-bold text-white">{activeCycle.name}</h2>
                <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    {new Date(activeCycle.starts_at).toLocaleDateString()} –{' '}
                    {new Date(activeCycle.ends_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-3xl font-mono font-bold text-white">{activeCycle.progress}%</div>
                <div className="text-xs text-zinc-400">
                  {activeCycle.completed_points} / {activeCycle.total_points} points completed
                </div>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${activeCycle.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                <span>Scope: {activeCycle.total_points || cycleIssues.reduce((sum, i) => sum + (i.estimate || 1), 0)} pts</span>
                <span>Completed: {activeCycle.completed_points || cycleIssues.filter((i) => i.state?.category === 'completed').reduce((sum, i) => sum + (i.estimate || 1), 0)} pts</span>
                <span>Remaining: {Math.max(0, (activeCycle.total_points || cycleIssues.reduce((sum, i) => sum + (i.estimate || 1), 0)) - (activeCycle.completed_points || 0))} pts</span>
              </div>
            </div>

            {/* Velocity Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-800">
              <div className="p-3 bg-black rounded border border-zinc-800">
                <span className="text-[11px] text-zinc-400 block mb-1">Cycle Velocity</span>
                <span className="text-lg font-bold text-white font-mono">38.5 pts avg</span>
              </div>
              <div className="p-3 bg-black rounded border border-zinc-800">
                <span className="text-[11px] text-zinc-400 block mb-1">Days Remaining</span>
                <span className="text-lg font-bold text-white font-mono">6 days</span>
              </div>
              <div className="p-3 bg-black rounded border border-zinc-800">
                <span className="text-[11px] text-zinc-400 block mb-1">Rollover Risk</span>
                <span className="text-lg font-bold text-zinc-300 font-mono">Low (0 overdue)</span>
              </div>
            </div>
          </div>
        )}

        {/* Cycle Issues List */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <span>Issues in Current Cycle</span>
            <span className="text-zinc-500 font-mono">({cycleIssues.length})</span>
          </h3>

          <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
            {cycleIssues.map((issue) => (
              <div key={issue.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-900 transition-colors text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-medium text-white">{issue.identifier}</span>
                  <span className="text-white font-medium truncate">{issue.title}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <StateBadge state={issue.state} />
                  <PriorityBadge priority={issue.priority} />
                  <span className="font-mono text-zinc-400">{issue.estimate}p</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
