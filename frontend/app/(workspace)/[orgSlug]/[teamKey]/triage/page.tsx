'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Inbox,
  Sparkles,
  Check,
  Clock,
  X,
  AlertCircle,
  Tag,
  User,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { Issue, TriageOutput } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { PriorityBadge } from '@/components/ui/PriorityBadge';

export default function TriagePage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const [currentTeam, setCurrentTeam] = useState<any>(null);
  const [teamStates, setTeamStates] = useState<any[]>([]);
  const [triageIssues, setTriageIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [triageAnalysis, setTriageAnalysis] = useState<TriageOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    api.getTeams(orgSlug).then(async (teams) => {
      if (!isMounted) return;
      const matched = teams.find((t) => t.key.toUpperCase() === teamKey) || teams[0];
      if (matched) {
        setCurrentTeam(matched);
        const states = await api.getWorkflowStates(matched.id);
        if (!isMounted) return;
        setTeamStates(states);

        const triageState = states.find((s) => s.category === 'triage') || states[0];
        let res = await api.getTriageIssues(matched.id);
        if (!res || res.length === 0) {
          // Fallback to getIssues with stateId if needed
          res = await api.getIssues({
            teamId: matched.id,
            stateId: triageState?.id,
          });
        }

        if (!isMounted) return;
        setTriageIssues(res || []);
        if (res && res.length > 0) {
          handleSelectTriage(res[0]);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [orgSlug, teamKey]);

  const [isSnoozeOpen, setIsSnoozeOpen] = useState(false);
  const [snoozeSuccess, setSnoozeSuccess] = useState<string | null>(null);

  const handleSelectTriage = async (issue: Issue) => {
    setSelectedIssue(issue);
    setIsAnalyzing(true);
    setTriageAnalysis(null);
    setIsSnoozeOpen(false);

    const teamId = issue.team_id || currentTeam?.id;
    const orgId = issue.organization_id || currentTeam?.organization_id;
    const analysis = await api.autoTriage(issue.title, issue.description_text || '', teamId, orgId);
    setTriageAnalysis(analysis);
    setIsAnalyzing(false);
  };

  const handleAccept = async (issueId: string, applyAI: boolean = true) => {
    // Resolve dynamic Todo or Unstarted state
    const todoState = teamStates.find((s) => s.category === 'unstarted') || teamStates[1] || teamStates[0];
    const targetStateId = todoState?.id;
    if (!targetStateId) return;

    let assigneeId: string | undefined;
    let priority: string | undefined;
    let estimate: number | undefined;

    // Apply AI triage recommendations if available
    if (applyAI && triageAnalysis) {
      if (triageAnalysis.suggested_priority) {
        priority = triageAnalysis.suggested_priority;
      }
      if (triageAnalysis.suggested_estimate !== undefined) {
        estimate = triageAnalysis.suggested_estimate;
      }
      if (triageAnalysis.suggested_assignee_id) {
        assigneeId = triageAnalysis.suggested_assignee_id;
      }
    }

    await api.acceptTriage(issueId, targetStateId, assigneeId, undefined, priority, estimate);
    setTriageIssues((prev) => prev.filter((i) => i.id !== issueId));
    setSelectedIssue(null);
    setTriageAnalysis(null);
    setIsSnoozeOpen(false);
  };

  const handleSnooze = async (issueId: string, duration: 'tomorrow' | 'next_week' | 'one_month') => {
    const now = new Date();
    let snoozedUntilDate = new Date();
    if (duration === 'tomorrow') {
      snoozedUntilDate.setDate(now.getDate() + 1);
      snoozedUntilDate.setHours(9, 0, 0, 0);
    } else if (duration === 'next_week') {
      snoozedUntilDate.setDate(now.getDate() + 7);
      snoozedUntilDate.setHours(9, 0, 0, 0);
    } else {
      snoozedUntilDate.setDate(now.getDate() + 30);
      snoozedUntilDate.setHours(9, 0, 0, 0);
    }

    const ok = await api.snoozeTriage(issueId, snoozedUntilDate.toISOString());
    if (ok) {
      setTriageIssues((prev) => prev.filter((i) => i.id !== issueId));
      setSelectedIssue(null);
      setTriageAnalysis(null);
      setIsSnoozeOpen(false);
    }
  };

  const handleDecline = async (issueId: string) => {
    await api.declineTriage(issueId, 'Declined from Triage inbox');
    setTriageIssues((prev) => prev.filter((i) => i.id !== issueId));
    setSelectedIssue(null);
    setTriageAnalysis(null);
    setIsSnoozeOpen(false);
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden font-sans">
      <TopNav
        title="Triage Inbox"
        subtitle={`${triageIssues.length} pending review`}
        breadcrumbs={[orgSlug || 'Workspace', currentTeam?.key || teamKey || 'Triage', 'Triage']}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Inbox Left List */}
        <div className="w-96 border-r border-zinc-800 bg-zinc-950 flex flex-col">
          <div className="p-3 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Incoming Issues</span>
            <span className="font-mono text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
              {triageIssues.length} new
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
            {triageIssues.map((issue) => {
              const isSelected = selectedIssue?.id === issue.id;
              return (
                <div
                  key={issue.id}
                  onClick={() => handleSelectTriage(issue)}
                  className={`p-4 cursor-pointer transition-colors space-y-2 ${
                    isSelected ? 'bg-zinc-900 border-l-2 border-white' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium text-white">{issue.identifier}</span>
                    <PriorityBadge priority={issue.priority} />
                  </div>
                  <h4 className="text-xs font-medium text-white line-clamp-2">{issue.title}</h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <span className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-800 font-medium">
                      Cross-team
                    </span>
                    <span>•</span>
                    <span className="truncate">From {issue.creator?.name || 'Workspace Member'}</span>
                  </div>
                </div>
              );
            })}

            {triageIssues.length === 0 && (
              <div className="py-16 text-center text-xs text-zinc-500 space-y-2">
                <Inbox className="w-8 h-8 text-zinc-600 mx-auto" />
                <p>Triage inbox is clean! All issues processed.</p>
              </div>
            )}
          </div>
        </div>

        {/* Selected Issue & AI Triage Analysis Right Area */}
        <div className="flex-1 bg-black p-8 overflow-y-auto">
          {selectedIssue ? (
            <div className="max-w-3xl space-y-6 animate-fade-in">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-2">
                    <span className="text-white font-bold">{selectedIssue.identifier}</span>
                    <span>•</span>
                    <span className="text-amber-300 bg-amber-950/40 border border-amber-800/60 px-1.5 py-0.5 rounded text-[10px] font-sans">
                      Cross-Team Request
                    </span>
                    <span>•</span>
                    <span>Received {new Date(selectedIssue.created_at).toLocaleDateString()}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-white">{selectedIssue.title}</h2>
                </div>

                {/* Triage Decision Actions */}
                <div className="flex items-center gap-2 relative">
                  {/* Decline Action */}
                  <button
                    onClick={() => handleDecline(selectedIssue.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-colors cursor-pointer"
                    title="Decline and cancel issue"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>

                  {/* Snooze Action & Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setIsSnoozeOpen((prev) => !prev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-colors cursor-pointer"
                      title="Snooze issue from triage inbox"
                    >
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Snooze</span>
                    </button>

                    {isSnoozeOpen && (
                      <div className="absolute right-0 mt-1.5 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-20 py-1 text-xs animate-fade-in font-sans">
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                          Snooze until...
                        </div>
                        <button
                          onClick={() => handleSnooze(selectedIssue.id, 'tomorrow')}
                          className="w-full text-left px-3 py-2 text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <span>Tomorrow morning</span>
                          <span className="text-[10px] text-zinc-500 font-mono">9 AM</span>
                        </button>
                        <button
                          onClick={() => handleSnooze(selectedIssue.id, 'next_week')}
                          className="w-full text-left px-3 py-2 text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <span>Next week</span>
                          <span className="text-[10px] text-zinc-500 font-mono">+7d</span>
                        </button>
                        <button
                          onClick={() => handleSnooze(selectedIssue.id, 'one_month')}
                          className="w-full text-left px-3 py-2 text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <span>In 30 days</span>
                          <span className="text-[10px] text-zinc-500 font-mono">+1mo</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Accept Action */}
                  <button
                    onClick={() => handleAccept(selectedIssue.id)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Accept & Assign</span>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="p-4 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
                {selectedIssue.description_text}
              </div>

              {/* AI Auto-Triage Recommendations Card */}
              <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-zinc-300" />
                    <span className="text-xs font-semibold text-white">
                      Auto-Triage Recommendation
                    </span>
                  </div>
                  {isAnalyzing && (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Computing workload & domains...</span>
                    </div>
                  )}
                </div>

                {triageAnalysis && (
                  <div className="space-y-4 animate-fade-in text-xs">
                    <p className="text-zinc-300 leading-relaxed italic bg-zinc-900 p-3 rounded border border-zinc-800">
                      "{triageAnalysis.reasoning}"
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-black rounded border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Recommended Team
                        </span>
                        <span className="font-semibold text-white">{triageAnalysis.suggested_team_key}</span>
                      </div>

                      <div className="p-3 bg-black rounded border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Recommended Priority
                        </span>
                        <PriorityBadge priority={triageAnalysis.suggested_priority} showLabel={true} />
                      </div>

                      <div className="p-3 bg-black rounded border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Suggested Points
                        </span>
                        <span className="font-mono font-semibold text-white">
                          {triageAnalysis.suggested_estimate} points
                        </span>
                      </div>

                      <div className="p-3 bg-black rounded border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Suggested Assignee
                        </span>
                        <span className="font-semibold text-white">
                          {triageAnalysis.suggested_assignee?.name || 'Alex Rivera'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-zinc-500">
              Select an incoming issue to review triage recommendations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
