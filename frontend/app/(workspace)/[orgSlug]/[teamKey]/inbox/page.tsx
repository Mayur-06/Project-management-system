'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, AlertTriangle, CheckCircle, Play, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Issue } from '@/types';
import { api } from '@/lib/api';

export default function InboxPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInbox = async () => {
      try {
        const orgInbox = await api.getInbox(orgSlug);
        setIssues(orgInbox || []);
      } catch (err) {
        console.error('Failed to fetch inbox:', err);
        setIssues([]);
      } finally {
        setLoading(false);
      }
    };
    fetchInbox();
  }, [orgSlug]);

  const getStateIcon = (stateName: string) => {
    switch (stateName.toLowerCase()) {
      case 'backlog':
      case 'unstarted':
        return <AlertTriangle className="w-4 h-4" />;
      case 'started':
      case 'todo':
      case 'in progress':
        return <Play className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'canceled':
      case 'cancelled':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
        return 'text-red-400 bg-red-950/50 border-red-800';
      case 'high':
        return 'text-orange-400 bg-orange-950/50 border-orange-800';
      case 'medium':
        return 'text-yellow-400 bg-yellow-950/50 border-yellow-800';
      case 'low':
        return 'text-green-400 bg-green-950/50 border-green-800';
      case 'none':
        return 'text-zinc-400 bg-zinc-950/50 border-zinc-700';
      default:
        return 'text-zinc-400 bg-zinc-950/50 border-zinc-700';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-400">Loading inbox...</div>
      </div>
    );
  }

  const renderIssueRow = (issue: Issue) => {
    const issueTeams = (issue as any).teams;
    const teamKey = issueTeams?.key || issue.identifier?.split('-')[0] || 'ENG';
    const issueId = issue.identifier || issue.id;
    const displayIdentifier = issue.identifier || issue.id;

    return (
      <Link
        key={issue.id}
        href={`/${orgSlug}/${teamKey}/issues/${issueId}`}
        className="block p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-700">
                {displayIdentifier}
              </span>
              <span className="text-xs text-zinc-500">
                {teamKey} • {new Date(issue.created_at).toLocaleDateString()}
              </span>
            </div>

            <h3 className="font-medium text-white truncate mb-2">
              {issue.title}
            </h3>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                {getStateIcon(issue.state?.name || 'Unknown')}
                <span className="text-xs text-zinc-400">
                  {issue.state?.name || 'Unknown'}
                </span>
              </div>

              <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(issue.priority)}`}>
                {issue.priority}
              </span>

              {issue.assignee?.name && (
                <span className="text-xs text-zinc-500">
                  Assignee: {issue.assignee.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
        <h1 className="text-2xl font-bold text-white">Org Inbox</h1>
        <p className="text-zinc-400 text-sm mt-1">Recent issues across the organization</p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <Clock className="w-12 h-12 mb-4" />
            <p>No issues in the inbox</p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map(renderIssueRow)}
          </div>
        )}
      </div>
    </div>
  );
}