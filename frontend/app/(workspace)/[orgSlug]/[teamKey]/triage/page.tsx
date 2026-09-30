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
  const orgSlug = (params?.orgSlug as string) || 'acme';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || 'ENG';

  const [triageIssues, setTriageIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [triageAnalysis, setTriageAnalysis] = useState<TriageOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    api.getIssues({ teamId: `team_${teamKey.toLowerCase()}`, stateId: 'st_triage' }).then((res) => {
      setTriageIssues(res);
      if (res.length > 0) {
        handleSelectTriage(res[0]);
      }
    });
  }, [teamKey]);

  const handleSelectTriage = async (issue: Issue) => {
    setSelectedIssue(issue);
    setIsAnalyzing(true);
    setTriageAnalysis(null);

    const analysis = await api.autoTriage(issue.title, issue.description_text || '');
    setTriageAnalysis(analysis);
    setIsAnalyzing(false);
  };

  const handleAccept = async (issueId: string) => {
    // Accept into Todo
    await api.updateIssue(issueId, { state_id: 'st_todo' });
    setTriageIssues((prev) => prev.filter((i) => i.id !== issueId));
    setSelectedIssue(null);
  };

  const handleDecline = async (issueId: string) => {
    await api.updateIssue(issueId, { state_id: 'st_canceled' });
    setTriageIssues((prev) => prev.filter((i) => i.id !== issueId));
    setSelectedIssue(null);
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      <TopNav
        title="Triage Inbox"
        subtitle={`${triageIssues.length} pending review`}
        breadcrumbs={['Acme Corp', teamKey, 'Triage']}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Inbox Left List */}
        <div className="w-96 border-r border-[#1e2026] bg-[#0a0b0e] flex flex-col">
          <div className="p-3 border-b border-[#181a20] text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Incoming Issues</span>
            <span className="font-mono text-pink-400 bg-pink-950/40 px-2 py-0.5 rounded border border-pink-900/50">
              {triageIssues.length} new
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#16181e]">
            {triageIssues.map((issue) => {
              const isSelected = selectedIssue?.id === issue.id;
              return (
                <div
                  key={issue.id}
                  onClick={() => handleSelectTriage(issue)}
                  className={`p-4 cursor-pointer transition-colors space-y-2 ${
                    isSelected ? 'bg-[#15171d] border-l-2 border-pink-500' : 'hover:bg-[#121418]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium text-pink-400">{issue.identifier}</span>
                    <PriorityBadge priority={issue.priority} />
                  </div>
                  <h4 className="text-xs font-medium text-zinc-100 line-clamp-2">{issue.title}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>Submitted by {issue.creator?.name || 'Customer / Sentry'}</span>
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
        <div className="flex-1 bg-[#08090a] p-8 overflow-y-auto">
          {selectedIssue ? (
            <div className="max-w-3xl space-y-6 animate-fade-in">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-2">
                    <span className="text-pink-400 font-bold">{selectedIssue.identifier}</span>
                    <span>•</span>
                    <span>Received {new Date(selectedIssue.created_at).toLocaleDateString()}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-100">{selectedIssue.title}</h2>
                </div>

                {/* Triage Decision Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDecline(selectedIssue.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-[#16181e] hover:bg-[#1f222a] border border-[#242730] transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-rose-400" />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={() => handleAccept(selectedIssue.id)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-md cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept & Assign</span>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="p-4 rounded-xl bg-[#0f1013] border border-[#1e2027] text-xs text-zinc-300 leading-relaxed">
                {selectedIssue.description_text}
              </div>

              {/* AI Auto-Triage Recommendations Card (LangGraph Triage Graph) */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/30 to-purple-950/20 border border-indigo-900/40 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-900/30 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-semibold text-indigo-200">
                      LangGraph Auto-Triage Recommendation
                    </span>
                  </div>
                  {isAnalyzing && (
                    <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Computing workload & domains...</span>
                    </div>
                  )}
                </div>

                {triageAnalysis && (
                  <div className="space-y-4 animate-fade-in text-xs">
                    <p className="text-zinc-300 leading-relaxed italic bg-indigo-950/40 p-3 rounded-xl border border-indigo-900/40">
                      "{triageAnalysis.reasoning}"
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#12141a] rounded-xl border border-[#20232e]">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                          Recommended Team
                        </span>
                        <span className="font-semibold text-zinc-100">{triageAnalysis.suggested_team_key}</span>
                      </div>

                      <div className="p-3 bg-[#12141a] rounded-xl border border-[#20232e]">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                          Recommended Priority
                        </span>
                        <PriorityBadge priority={triageAnalysis.suggested_priority} showLabel={true} />
                      </div>

                      <div className="p-3 bg-[#12141a] rounded-xl border border-[#20232e]">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                          Suggested Points
                        </span>
                        <span className="font-mono font-semibold text-zinc-100">
                          {triageAnalysis.suggested_estimate} points
                        </span>
                      </div>

                      <div className="p-3 bg-[#12141a] rounded-xl border border-[#20232e]">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                          Suggested Assignee
                        </span>
                        <span className="font-semibold text-zinc-100">
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
