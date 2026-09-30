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
  const orgSlug = (params?.orgSlug as string) || 'acme';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || 'ENG';

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleIssues, setCycleIssues] = useState<Issue[]>([]);
  const [activeCycle, setActiveCycle] = useState<Cycle | null>(null);

  useEffect(() => {
    api.getCycles(`team_${teamKey.toLowerCase()}`).then((res) => {
      setCycles(res);
      if (res.length > 0) {
        setActiveCycle(res[0]);
      }
    });

    api.getIssues({ teamId: `team_${teamKey.toLowerCase()}`, cycleId: 'cyc_active' }).then(setCycleIssues);
  }, [teamKey]);

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      <TopNav
        title="Cycles & Velocity"
        subtitle="Sprint Management"
        breadcrumbs={['Acme Corp', teamKey, 'Cycles']}
      />

      <div className="flex-1 p-8 overflow-y-auto space-y-8 max-w-6xl mx-auto w-full">
        {/* Active Cycle Hero Card */}
        {activeCycle && (
          <div className="p-6 rounded-2xl bg-[#0f1014] border border-[#1f222a] space-y-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>CURRENT ACTIVE SPRINT</span>
                </div>
                <h2 className="text-2xl font-bold text-zinc-100">{activeCycle.name}</h2>
                <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    {new Date(activeCycle.starts_at).toLocaleDateString()} –{' '}
                    {new Date(activeCycle.ends_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-3xl font-mono font-bold text-indigo-400">{activeCycle.progress}%</div>
                <div className="text-xs text-zinc-500">
                  {activeCycle.completed_points} / {activeCycle.total_points} points completed
                </div>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-3 bg-[#181a22] rounded-full overflow-hidden border border-[#232632]">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${activeCycle.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
                <span>Scope: 34 pts</span>
                <span>Burnup Rate: 2.3 pts/day</span>
                <span>Remaining: 11 pts</span>
              </div>
            </div>

            {/* Velocity Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#1a1c24]">
              <div className="p-3 bg-[#14161d] rounded-xl border border-[#20232e]">
                <span className="text-[11px] text-zinc-400 block mb-1">Cycle Velocity</span>
                <span className="text-lg font-bold text-zinc-100 font-mono">38.5 pts avg</span>
              </div>
              <div className="p-3 bg-[#14161d] rounded-xl border border-[#20232e]">
                <span className="text-[11px] text-zinc-400 block mb-1">Days Remaining</span>
                <span className="text-lg font-bold text-amber-400 font-mono">6 days</span>
              </div>
              <div className="p-3 bg-[#14161d] rounded-xl border border-[#20232e]">
                <span className="text-[11px] text-zinc-400 block mb-1">Rollover Risk</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">Low (0 overdue)</span>
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

          <div className="bg-[#0e0f13] border border-[#1e2027] rounded-xl overflow-hidden divide-y divide-[#181a20]">
            {cycleIssues.map((issue) => (
              <div key={issue.id} className="p-3.5 flex items-center justify-between hover:bg-[#14161c] transition-colors text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-medium text-indigo-400">{issue.identifier}</span>
                  <span className="text-zinc-100 font-medium truncate">{issue.title}</span>
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
