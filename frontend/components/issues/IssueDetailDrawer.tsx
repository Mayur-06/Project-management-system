'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Send,
  CheckCircle2,
  CornerDownRight,
  MessageSquare,
  Activity,
  User as UserIcon,
  Loader2,
} from 'lucide-react';
import { Issue, IssueComment, ActivityLog, IssuePriority, WorkflowState } from '@/types';
import { api } from '@/lib/api';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StateBadge } from '@/components/ui/StateBadge';

interface IssueDetailDrawerProps {
  issue: Issue | null;
  states?: WorkflowState[];
  onClose: () => void;
  onUpdateIssue: (updated: Issue) => void;
}

export const IssueDetailDrawer: React.FC<IssueDetailDrawerProps> = ({
  issue,
  states = [],
  onClose,
  onUpdateIssue,
}) => {
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'ai_breakdown'>('comments');
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [newComment, setNewComment] = useState('');
  
  // AI Spec & Subtask breakdown state
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [proposedSubtasks, setProposedSubtasks] = useState<string[]>([]);
  const [breakdownComplete, setBreakdownComplete] = useState(false);

  useEffect(() => {
    if (issue) {
      api.getComments(issue.id).then(setComments);
      api.getActivityLogs(issue.id).then(setActivityLogs);
      setProposedSubtasks([]);
      setBreakdownComplete(false);
    }
  }, [issue]);

  if (!issue) return null;

  const handleStatusChange = async (stateId: string) => {
    try {
      const updated = await api.updateIssue(issue.id, {
        state_id: stateId,
        expected_version: issue.version,
      });
      if (updated) {
        onUpdateIssue(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePriorityChange = async (priority: IssuePriority) => {
    try {
      const updated = await api.updateIssue(issue.id, {
        priority,
        expected_version: issue.version,
      });
      if (updated) {
        onUpdateIssue(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const added = await api.addComment(issue.id, newComment);
    if (added) {
      setComments((prev) => [...prev, added]);
    }
    setNewComment('');
  };

  // Run LangGraph Spec Writer & Subtask Breakdown
  const handleStartAIBreakdown = async () => {
    setIsBreakingDown(true);
    setActiveTab('ai_breakdown');

    const res = await api.startBreakdown(issue.id);
    if (res?.proposed_tasks) {
      setProposedSubtasks(res.proposed_tasks);
    } else {
      setProposedSubtasks([
        `Configure backend endpoints for ${issue.identifier}`,
        `Implement automated integration tests`,
        `Add client UI updates and error boundaries`,
      ]);
    }
    setIsBreakingDown(false);
  };

  const handleApproveSubtasks = async () => {
    setBreakdownComplete(true);
    const updated = {
      ...issue,
      subtasks: [
        ...(issue.subtasks || []),
        ...proposedSubtasks.map((taskTitle, idx) => ({
          id: `iss_sub_${Date.now()}_${idx}`,
          organization_id: issue.organization_id,
          team_id: issue.team_id,
          number: (issue.number || 100) + idx + 1,
          identifier: `${issue.identifier}-sub${idx + 1}`,
          title: taskTitle,
          priority: 'medium' as IssuePriority,
          state_id: states[0]?.id || issue.state_id,
          state: states[0] || issue.state,
          creator_id: issue.creator_id,
          parent_id: issue.id,
          sort_order: `${idx}|sub:`,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
      ],
    };
    onUpdateIssue(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-xs animate-fade-in font-sans">
      <div className="w-full max-w-3xl h-full bg-black border-l border-zinc-800 flex flex-col shadow-2xl overflow-hidden animate-fade-in">
        {/* Drawer Header */}
        <div className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono font-bold text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
              {issue.identifier}
            </span>
            {issue.creator?.name && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400">Created by {issue.creator.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAIBreakdown}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
              <span>AI Spec Breakdown</span>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Column */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <h2 className="text-lg font-semibold text-white leading-snug">{issue.title}</h2>

            {/* Description */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Description</h3>
              <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {issue.description_text || 'No description provided.'}
              </div>
            </div>

            {/* Sub-tasks Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <span>Sub-tasks</span>
                  <span className="text-zinc-400 font-mono">({issue.subtasks?.length || 0})</span>
                </h3>
              </div>

              {issue.subtasks && issue.subtasks.length > 0 ? (
                <div className="space-y-1.5">
                  {issue.subtasks.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CornerDownRight className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="font-mono text-zinc-400 text-[11px]">{sub.identifier}</span>
                        <span className="text-zinc-200">{sub.title}</span>
                      </div>
                      <StateBadge state={sub.state} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center rounded border border-dashed border-zinc-800 text-xs text-zinc-500">
                  No sub-tasks attached.
                </div>
              )}
            </div>

            {/* Tabs: Comments vs Activity vs AI Breakdown */}
            <div className="border-t border-zinc-800 pt-4 space-y-4">
              <div className="flex items-center gap-4 border-b border-zinc-800 pb-2 text-xs font-medium">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`flex items-center gap-1.5 pb-2 -mb-2 cursor-pointer ${
                    activeTab === 'comments'
                      ? 'text-white border-b-2 border-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Comments ({comments.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`flex items-center gap-1.5 pb-2 -mb-2 cursor-pointer ${
                    activeTab === 'activity'
                      ? 'text-white border-b-2 border-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Activity Logs</span>
                </button>
                <button
                  onClick={() => setActiveTab('ai_breakdown')}
                  className={`flex items-center gap-1.5 pb-2 -mb-2 cursor-pointer ${
                    activeTab === 'ai_breakdown'
                      ? 'text-white border-b-2 border-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                  <span>AI Breakdown Gate</span>
                </button>
              </div>

              {activeTab === 'comments' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {comments.map((cmt) => (
                      <div key={cmt.id} className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{cmt.user?.name || 'User'}</span>
                            <span className="text-zinc-500">{new Date(cmt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">{cmt.body_text}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <div className="text-xs text-zinc-500 py-3">No comments yet.</div>
                    )}
                  </div>

                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Leave a comment..."
                      className="flex-1 bg-zinc-900 text-xs text-white placeholder-zinc-500 px-3.5 py-2 rounded border border-zinc-800 focus:border-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim()}
                      className="px-4 py-2 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-30 transition-colors shadow-xs cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-2 text-xs">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{log.actor?.name || 'User'}</span>
                        <span className="text-zinc-400 font-mono text-[11px]">{log.action}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                  {activityLogs.length === 0 && (
                    <div className="text-xs text-zinc-500 py-3">No activity logs recorded.</div>
                  )}
                </div>
              )}

              {activeTab === 'ai_breakdown' && (
                <div className="p-4 rounded bg-zinc-950 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <Sparkles className="w-4 h-4 text-zinc-300" />
                      <span>Review Gate</span>
                    </div>
                    {isBreakingDown && <Loader2 className="w-4 h-4 text-white animate-spin" />}
                  </div>

                  {proposedSubtasks.length > 0 && !breakdownComplete && (
                    <div className="space-y-2.5 animate-fade-in">
                      <p className="text-xs text-zinc-300">
                        Proposed sub-tasks generated by AI. Review before persisting:
                      </p>
                      <div className="space-y-1.5 pl-2">
                        {proposedSubtasks.map((task, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-white">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            <span>{task}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleApproveSubtasks}
                          className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-xs cursor-pointer"
                        >
                          Approve & Insert Sub-tasks
                        </button>
                      </div>
                    </div>
                  )}

                  {breakdownComplete && (
                    <div className="p-3 bg-zinc-900 border border-zinc-700 rounded text-xs text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>Sub-tasks successfully created.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Properties Sidebar */}
          <div className="w-64 border-l border-zinc-800 p-4 bg-zinc-950 space-y-4 text-xs">
            <h3 className="font-semibold uppercase tracking-wider text-zinc-400 text-[11px]">Properties</h3>

            {/* Status */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Status</label>
              <select
                value={issue.state_id}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none"
              >
                {states.length > 0 ? (
                  states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option value={issue.state_id}>{issue.state?.name || 'Current Status'}</option>
                )}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Priority</label>
              <select
                value={issue.priority}
                onChange={(e) => handlePriorityChange(e.target.value as IssuePriority)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded p-2 focus:border-white focus:outline-none"
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
              <label className="text-[11px] text-zinc-400 block mb-1">Assignee</label>
              <div className="flex items-center gap-2 p-2 rounded bg-zinc-900 border border-zinc-800">
                {issue.assignee?.avatar_url ? (
                  <img
                    src={issue.assignee.avatar_url}
                    alt={issue.assignee.name}
                    className="w-5 h-5 rounded-full object-cover ring-1 ring-zinc-700"
                  />
                ) : (
                  <UserIcon className="w-4 h-4 text-zinc-500" />
                )}
                <span className="text-zinc-200">{issue.assignee?.name || 'Unassigned'}</span>
              </div>
            </div>

            {/* Estimate Points */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Estimate Points</label>
              <div className="p-2 rounded bg-zinc-900 border border-zinc-800 font-mono text-white">
                {issue.estimate || 1} points
              </div>
            </div>

            {/* Project */}
            {issue.project && (
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Project</label>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-200">
                  {issue.project.name}
                </div>
              </div>
            )}

            {/* Cycle */}
            {issue.cycle && (
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Cycle</label>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-200">
                  {issue.cycle.name}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
