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
    <div className="flex flex-col flex-1 h-full overflow-hidden font-sans">
      <TopNav
        title="Triage Inbox"
        subtitle={`${triageIssues.length} pending review`}
        breadcrumbs={['Acme Corp', teamKey, 'Triage']}
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
        <div className="flex-1 bg-black p-8 overflow-y-auto">
          {selectedIssue ? (
            <div className="max-w-3xl space-y-6 animate-fade-in">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-2">
                    <span className="text-white font-bold">{selectedIssue.identifier}</span>
                    <span>•</span>
                    <span>Received {new Date(selectedIssue.created_at).toLocaleDateString()}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-white">{selectedIssue.title}</h2>
                </div>

                {/* Triage Decision Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDecline(selectedIssue.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
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
