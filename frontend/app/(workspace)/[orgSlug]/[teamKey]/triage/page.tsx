'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Inbox,
  Send,
  Sparkles,
  Check,
  Clock,
  X,
  AlertCircle,
  Tag,
  User as UserIcon,
  ArrowUpRight,
  Loader2,
  Sliders,
  ExternalLink,
  ChevronRight,
  CornerDownRight,
} from 'lucide-react';
import { Issue, IssuePriority, TriageOutput, Team, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { PriorityBadge } from '@/components/ui/PriorityBadge';

interface SentTriageIssue extends Issue {
  destinationTeam?: Team;
}

export default function TriagePage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [teamStates, setTeamStates] = useState<WorkflowState[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; email: string }[]>([]);

  // Triage Tabs: 'incoming' (inbox) or 'sent' (outbox to other teams)
  const [activeTab, setActiveTab] = useState<'incoming' | 'sent'>('incoming');
  const [triageIssues, setTriageIssues] = useState<Issue[]>([]);
  const [sentIssues, setSentIssues] = useState<SentTriageIssue[]>([]);

  // Selection & Details
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedSentIssue, setSelectedSentIssue] = useState<SentTriageIssue | null>(null);

  // AI Analysis state
  const [triageAnalysis, setTriageAnalysis] = useState<TriageOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);

  // Manual Triaging Decision Form Values (User Selection)
  const [formStateId, setFormStateId] = useState<string>('');
  const [formAssigneeId, setFormAssigneeId] = useState<string>('');
  const [formPriority, setFormPriority] = useState<IssuePriority>('medium');
  const [formEstimate, setFormEstimate] = useState<number>(0);
  const [isAccepting, setIsAccepting] = useState(false);

  // Snooze dropdown state
  const [isSnoozeOpen, setIsSnoozeOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    api.getTeams(orgSlug).then(async (teams) => {
      if (!isMounted) return;
      setAllTeams(teams);
      const matched = teams.find((t) => t.key.toUpperCase() === teamKey) || teams[0];
      if (matched) {
        setCurrentTeam(matched);

        // Fetch workflow states
        const states = await api.getWorkflowStates(matched.id);
        if (!isMounted) return;
        setTeamStates(states);

        // Fetch team members for assignee dropdown
        api.getTeamMembers(matched.id).then((tms) => {
          if (!isMounted || !tms) return;
          setTeamMembers(
            tms.map((tm: any) => ({
              id: tm.user_id || tm.id,
              name: tm.user?.name || tm.user?.email || 'Member',
              email: tm.user?.email || '',
            }))
          );
        }).catch(() => {});

        // Fetch incoming triage issues for current team
        const triageState = states.find((s) => s.category === 'triage') || states[0];
        let res = await api.getTriageIssues(matched.id);
        if (!res || res.length === 0) {
          res = await api.getIssues({
            teamId: matched.id,
            stateId: triageState?.id,
          });
        }
        if (!isMounted) return;
        setTriageIssues(res || []);
        if (res && res.length > 0) {
          handleSelectIncoming(res[0], states);
        }

        // Fetch outgoing cross-team issues sent to OTHER teams currently in triage
        const otherTeams = teams.filter((t) => t.id !== matched.id);
        const sentPromises = otherTeams.map(async (other) => {
          try {
            const otherTriage = await api.getTriageIssues(other.id);
            return (otherTriage || []).map((iss) => ({
              ...iss,
              destinationTeam: other,
            }));
          } catch {
            return [];
          }
        });
        const allSent = (await Promise.all(sentPromises)).flat();
        if (isMounted) {
          setSentIssues(allSent);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [orgSlug, teamKey]);

  // When an incoming issue is selected: populate form fields with defaults and run AI triage
  const handleSelectIncoming = async (issue: Issue, statesOverride?: WorkflowState[]) => {
    setSelectedIssue(issue);
    setSelectedSentIssue(null);
    setIsAnalyzing(true);
    setTriageAnalysis(null);
    setAiApplied(false);
    setIsSnoozeOpen(false);

    const availableStates = statesOverride || teamStates;
    const defaultState =
      availableStates.find((s) => s.category === 'unstarted') ||
      availableStates.find((s) => s.category !== 'triage') ||
      availableStates[0];

    // Initialize interactive form controls with issue's current properties
    setFormStateId(defaultState?.id || '');
    setFormAssigneeId(issue.assignee_id || '');
    setFormPriority((issue.priority as IssuePriority) || 'medium');
    setFormEstimate(issue.estimate ?? 0);

    // Run AI analysis
    const teamId = issue.team_id || currentTeam?.id;
    const orgId = issue.organization_id || currentTeam?.organization_id;
    try {
      const analysis = await api.autoTriage(issue.title, issue.description_text || '', teamId, orgId);
      setTriageAnalysis(analysis);
    } catch (err) {
      console.warn('Auto triage analysis error:', err);
      setTriageAnalysis(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectSent = (sentIssue: SentTriageIssue) => {
    setSelectedSentIssue(sentIssue);
    setSelectedIssue(null);
    setTriageAnalysis(null);
  };

  // User manually applies AI recommendations to the form
  const handleApplyAISuggestions = () => {
    if (!triageAnalysis) return;

    if (triageAnalysis.suggested_priority) {
      setFormPriority(triageAnalysis.suggested_priority as IssuePriority);
    }
    if (triageAnalysis.suggested_estimate !== undefined) {
      setFormEstimate(triageAnalysis.suggested_estimate);
    }
    if (triageAnalysis.suggested_assignee_id) {
      setFormAssigneeId(triageAnalysis.suggested_assignee_id);
    }
    setAiApplied(true);
    setTimeout(() => setAiApplied(false), 3000);
  };

  // Accept issue with user-chosen properties (State, Assignee, Priority, Estimate)
  const handleAccept = async () => {
    if (!selectedIssue) return;
    setIsAccepting(true);

    const targetStateId = formStateId || teamStates.find((s) => s.category === 'unstarted')?.id || teamStates[0]?.id;
    if (!targetStateId) {
      setIsAccepting(false);
      return;
    }

    try {
      await api.acceptTriage(
        selectedIssue.id,
        targetStateId,
        formAssigneeId ? formAssigneeId : undefined,
        undefined,
        formPriority,
        formEstimate ? formEstimate : undefined
      );

      const nextList = triageIssues.filter((i) => i.id !== selectedIssue.id);
      setTriageIssues(nextList);
      if (nextList.length > 0) {
        handleSelectIncoming(nextList[0]);
      } else {
        setSelectedIssue(null);
        setTriageAnalysis(null);
      }
    } finally {
      setIsAccepting(false);
    }
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
      const nextList = triageIssues.filter((i) => i.id !== issueId);
      setTriageIssues(nextList);
      if (nextList.length > 0) {
        handleSelectIncoming(nextList[0]);
      } else {
        setSelectedIssue(null);
        setTriageAnalysis(null);
      }
      setIsSnoozeOpen(false);
    }
  };

  const handleDecline = async (issueId: string) => {
    await api.declineTriage(issueId, 'Declined from Triage inbox');
    const nextList = triageIssues.filter((i) => i.id !== issueId);
    setTriageIssues(nextList);
    if (nextList.length > 0) {
      handleSelectIncoming(nextList[0]);
    } else {
      setSelectedIssue(null);
      setTriageAnalysis(null);
    }
    setIsSnoozeOpen(false);
  };

  const activeWorkflowStates = teamStates.filter((s) => s.category !== 'triage' && s.category !== 'canceled');

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden font-sans bg-black">
      <TopNav
        title="Triage Inbox"
        subtitle={`${triageIssues.length} incoming requests pending review`}
        breadcrumbs={[orgSlug || 'Workspace', currentTeam?.key || teamKey || 'Triage', 'Triage']}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Tabs & Issue List */}
        <div className="w-96 border-r border-zinc-800 bg-zinc-950 flex flex-col">
          {/* Tab Selection */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/50">
            <button
              onClick={() => {
                setActiveTab('incoming');
                if (triageIssues.length > 0 && (!selectedIssue || selectedSentIssue)) {
                  handleSelectIncoming(triageIssues[0]);
                }
              }}
              className={`flex-1 py-3 px-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'incoming'
                  ? 'border-white text-white bg-zinc-900/70'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Incoming</span>
              <span className="font-mono text-[10px] bg-zinc-800 px-1.5 py-0.2 rounded border border-zinc-700">
                {triageIssues.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('sent');
                if (sentIssues.length > 0) {
                  handleSelectSent(sentIssues[0]);
                } else {
                  setSelectedIssue(null);
                  setSelectedSentIssue(null);
                }
              }}
              className={`flex-1 py-3 px-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'sent'
                  ? 'border-white text-white bg-zinc-900/70'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Sent to Others</span>
              <span className="font-mono text-[10px] bg-zinc-800 px-1.5 py-0.2 rounded border border-zinc-700">
                {sentIssues.length}
              </span>
            </button>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80">
            {activeTab === 'incoming' && (
              <>
                {triageIssues.map((issue) => {
                  const isSelected = selectedIssue?.id === issue.id;
                  return (
                    <div
                      key={issue.id}
                      onClick={() => handleSelectIncoming(issue)}
                      className={`p-4 cursor-pointer transition-colors space-y-2 ${
                        isSelected ? 'bg-zinc-900 border-l-2 border-white' : 'hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-medium text-white">{issue.identifier}</span>
                        <PriorityBadge priority={issue.priority} />
                      </div>
                      <h4 className="text-xs font-medium text-white line-clamp-2 leading-relaxed">
                        {issue.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <span className="text-[10px] bg-amber-950/40 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-medium">
                          Cross-team
                        </span>
                        <span>•</span>
                        <span className="truncate">From {issue.creator?.name || 'Workspace Member'}</span>
                      </div>
                    </div>
                  );
                })}

                {triageIssues.length === 0 && (
                  <div className="py-16 text-center text-xs text-zinc-500 space-y-2 px-6">
                    <Inbox className="w-8 h-8 text-zinc-600 mx-auto stroke-[1.5]" />
                    <p className="font-medium text-zinc-400">Incoming inbox is clean!</p>
                    <p className="text-[11px] text-zinc-600 leading-normal">
                      When another team creates an issue for {currentTeam?.key || 'this team'}, it will arrive here for triage review.
                    </p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'sent' && (
              <>
                {sentIssues.map((issue) => {
                  const isSelected = selectedSentIssue?.id === issue.id;
                  return (
                    <div
                      key={issue.id}
                      onClick={() => handleSelectSent(issue)}
                      className={`p-4 cursor-pointer transition-colors space-y-2 ${
                        isSelected ? 'bg-zinc-900 border-l-2 border-amber-400' : 'hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-medium text-zinc-300">{issue.identifier}</span>
                        <span className="text-[10px] bg-blue-950/40 text-blue-300 border border-blue-800/60 px-1.5 py-0.5 rounded font-medium font-sans">
                          To {issue.destinationTeam?.key || 'Other Team'}
                        </span>
                      </div>
                      <h4 className="text-xs font-medium text-white line-clamp-2 leading-relaxed">
                        {issue.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <Clock className="w-3 h-3 text-amber-400/80" />
                        <span>Awaiting {issue.destinationTeam?.name || 'team'} triage</span>
                      </div>
                    </div>
                  );
                })}

                {sentIssues.length === 0 && (
                  <div className="py-16 text-center text-xs text-zinc-500 space-y-2 px-6">
                    <Send className="w-8 h-8 text-zinc-600 mx-auto stroke-[1.5]" />
                    <p className="font-medium text-zinc-400">No outgoing requests pending</p>
                    <p className="text-[11px] text-zinc-600 leading-normal">
                      Issues created from this team targeting other teams will appear here while pending review in their triage inbox.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Review / Details Area */}
        <div className="flex-1 bg-black p-8 overflow-y-auto">
          {/* View 1: Incoming Issue Triaging Mode */}
          {activeTab === 'incoming' && selectedIssue && (
            <div className="max-w-3xl space-y-6 animate-fade-in">
              {/* Header Banner */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-2">
                    <span className="text-white font-bold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
                      {selectedIssue.identifier}
                    </span>
                    <span>•</span>
                    <span className="text-amber-300 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-sans">
                      Incoming Cross-Team Request
                    </span>
                    <span>•</span>
                    <span>Received {new Date(selectedIssue.created_at).toLocaleDateString()}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-white tracking-tight">{selectedIssue.title}</h2>
                </div>

                {/* Primary Decision Action Buttons */}
                <div className="flex items-center gap-2 relative shrink-0">
                  {/* Decline Button */}
                  <button
                    onClick={() => handleDecline(selectedIssue.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-red-400 bg-zinc-900 hover:bg-red-950/30 border border-zinc-800 hover:border-red-800/60 transition-colors cursor-pointer"
                    title="Decline and cancel issue"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>

                  {/* Snooze Dropdown */}
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

                  {/* Accept & Move Button */}
                  <button
                    disabled={isAccepting}
                    onClick={handleAccept}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isAccepting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    )}
                    <span>Accept & Move to Backlog</span>
                  </button>
                </div>
              </div>

              {/* Description Box */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {selectedIssue.description_text || 'No description provided for this request.'}
              </div>

              {/* Interactive Triaging Configuration Panel (Manual User Controls) */}
              <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-zinc-400" />
                    <span className="text-xs font-semibold text-white">
                      Triage Placement & Assignment
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    Configure issue properties before accepting
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  {/* Target Workflow State */}
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                      Move to Status
                    </label>
                    <select
                      value={formStateId}
                      onChange={(e) => setFormStateId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-xs text-white rounded p-2 focus:border-white focus:outline-none cursor-pointer"
                    >
                      {activeWorkflowStates.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                      Priority Tier
                    </label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as IssuePriority)}
                      className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-xs text-white rounded p-2 focus:border-white focus:outline-none cursor-pointer capitalize"
                    >
                      <option value="none">None</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  {/* Assignee */}
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                      Assign To Member
                    </label>
                    <select
                      value={formAssigneeId}
                      onChange={(e) => setFormAssigneeId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-xs text-white rounded p-2 focus:border-white focus:outline-none cursor-pointer"
                    >
                      <option value="">👤 Unassigned</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estimate */}
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                      Estimate Points
                    </label>
                    <select
                      value={formEstimate}
                      onChange={(e) => setFormEstimate(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-xs text-white rounded p-2 focus:border-white focus:outline-none cursor-pointer"
                    >
                      <option value={0}>0 pts (None)</option>
                      <option value={1}>1 pt</option>
                      <option value={2}>2 pts</option>
                      <option value={3}>3 pts</option>
                      <option value={5}>5 pts</option>
                      <option value={8}>8 pts</option>
                      <option value={13}>13 pts</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* AI Auto-Triage Recommendation Card */}
              <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-white">
                      AI Auto-Triage Recommendation
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAnalyzing && (
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Analyzing workload & semantic fit...</span>
                      </div>
                    )}

                    {triageAnalysis && (
                      <button
                        onClick={handleApplyAISuggestions}
                        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-colors cursor-pointer"
                        title="Copy AI suggestions into your triage selection above"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Apply AI Suggestions</span>
                      </button>
                    )}
                  </div>
                </div>

                {aiApplied && (
                  <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
                    <Check className="w-4 h-4" />
                    <span>AI recommendations applied to the form above. Review and click "Accept & Move".</span>
                  </div>
                )}

                {triageAnalysis && (
                  <div className="space-y-4 animate-fade-in text-xs">
                    <p className="text-zinc-300 leading-relaxed italic bg-zinc-900/80 p-3.5 rounded-lg border border-zinc-800">
                      "{triageAnalysis.reasoning}"
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Suggested Team
                        </span>
                        <span className="font-semibold text-white">{triageAnalysis.suggested_team_key}</span>
                      </div>

                      <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Suggested Priority
                        </span>
                        <PriorityBadge priority={triageAnalysis.suggested_priority} showLabel={true} />
                      </div>

                      <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Suggested Points
                        </span>
                        <span className="font-mono font-semibold text-white">
                          {triageAnalysis.suggested_estimate} points
                        </span>
                      </div>

                      <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                          Suggested Assignee
                        </span>
                        <span className="font-semibold text-white">
                          {triageAnalysis.suggested_assignee?.name || 'Workspace Member'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* View 2: Sent to Other Teams (Outbox Mode) */}
          {activeTab === 'sent' && selectedSentIssue && (
            <div className="max-w-3xl space-y-6 animate-fade-in">
              {/* Outbox Header Banner */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-2">
                    <span className="text-white font-bold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
                      {selectedSentIssue.identifier}
                    </span>
                    <span>•</span>
                    <span className="text-blue-300 bg-blue-950/40 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-sans">
                      Outgoing Request → {selectedSentIssue.destinationTeam?.name || 'Other Team'}
                    </span>
                    <span>•</span>
                    <span>Sent {new Date(selectedSentIssue.created_at).toLocaleDateString()}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-white tracking-tight">{selectedSentIssue.title}</h2>
                </div>

                {/* Jump to recipient team triage if user has access */}
                {selectedSentIssue.destinationTeam && (
                  <button
                    onClick={() =>
                      router.push(`/${orgSlug}/${selectedSentIssue.destinationTeam?.key.toLowerCase()}/triage`)
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-xs cursor-pointer shrink-0"
                  >
                    <span>Open {selectedSentIssue.destinationTeam.key} Triage</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Outbox Status Explanation Card */}
              <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-800/40 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>Pending Triage Review by {selectedSentIssue.destinationTeam?.name || 'Destination Team'}</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  This issue was sent from <strong>{currentTeam?.key}</strong> to <strong>{selectedSentIssue.destinationTeam?.name} ({selectedSentIssue.destinationTeam?.key})</strong>.
                  It is currently in their <strong>Triage Inbox</strong> waiting for their team leads to accept, assign an owner, and prioritize into their backlog.
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Request Description</h3>
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {selectedSentIssue.description_text || 'No description provided.'}
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    Destination Team
                  </span>
                  <span className="text-white font-medium">
                    {selectedSentIssue.destinationTeam?.name} ({selectedSentIssue.destinationTeam?.key})
                  </span>
                </div>

                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    Initial Priority
                  </span>
                  <PriorityBadge priority={selectedSentIssue.priority} showLabel={true} />
                </div>

                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                    Current Workflow State
                  </span>
                  <span className="text-amber-300 font-mono font-medium">Triage Inbox</span>
                </div>
              </div>
            </div>
          )}

          {/* Empty Selection State */}
          {!selectedIssue && !selectedSentIssue && (
            <div className="flex flex-col items-center justify-center h-full text-xs text-zinc-500 space-y-3">
              <Inbox className="w-10 h-10 text-zinc-700 stroke-[1.2]" />
              <p>Select an issue from the list to review, assign, and accept.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
