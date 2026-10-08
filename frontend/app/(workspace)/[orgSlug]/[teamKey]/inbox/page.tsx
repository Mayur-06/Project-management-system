/**
 * @related-files:
 * - frontend/components/navigation/TopNav.tsx
 * - frontend/components/ui/StateBadge.tsx
 * - frontend/components/ui/PriorityBadge.tsx
 * - frontend/lib/api.ts
 * - backend/app/api/v1/phase3.py
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Inbox,
  Trash2,
  MessageSquare,
  PlusCircle,
  Edit3,
  Paperclip,
  Clock,
  Loader2,
} from 'lucide-react';
import { InboxItem } from '@/types';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { StateBadge } from '@/components/ui/StateBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/WorkspaceContext';

import { Button } from '@/components/ui/button';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 60) return 'just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

function getActionDetails(action: string, changes?: Record<string, any>) {
  switch (action) {
    case 'issue_created':
      return {
        label: 'created issue',
        icon: <PlusCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      };
    case 'issue_deleted':
      return {
        label: 'deleted issue',
        icon: <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />,
      };
    case 'comment_created':
      return {
        label: 'commented on',
        icon: <MessageSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" />,
      };
    case 'attachment_uploaded':
      return {
        label: 'uploaded attachment to',
        icon: <Paperclip className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
      };
    case 'issue_updated': {
      if (changes?.state_id || changes?.state) {
        return {
          label: 'changed state on',
          icon: <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
        };
      }
      if (changes?.priority) {
        return {
          label: 'updated priority on',
          icon: <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
        };
      }
      if (changes?.assignee_id) {
        return {
          label: 'reassigned',
          icon: <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
        };
      }
      return {
        label: 'updated',
        icon: <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      };
    }
    default:
      return {
        label: 'activity on',
        icon: <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />,
      };
  }
}

const PAGE_SIZE = 50;

export default function InboxPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const { organization } = useWorkspace();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchInbox = useCallback(
    async (offset = 0, isInitial = false) => {
      if (!orgSlug) return;
      try {
        if (isInitial) setLoading(true);
        else setLoadingMore(true);

        const data = await api.getInbox(orgSlug, offset, PAGE_SIZE);
        const fetched = data || [];

        if (offset === 0) {
          setItems(fetched);
        } else {
          setItems((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const fresh = fetched.filter((i) => !existingIds.has(i.id));
            return [...prev, ...fresh];
          });
        }

        if (fetched.length < PAGE_SIZE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      } catch (err) {
        console.error('Failed to fetch inbox activity:', err);
      } finally {
        if (isInitial) setLoading(false);
        setLoadingMore(false);
      }
    },
    [orgSlug]
  );

  useEffect(() => {
    fetchInbox(0, true);
  }, [fetchInbox]);

  // Real-time Supabase WebSocket listener on activity_logs
  useEffect(() => {
    if (!organization?.id) return;

    const channel = supabase
      .channel(`inbox_org_${organization.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `organization_id=eq.${organization.id}`,
        },
        async () => {
          // Re-fetch top 50 items to integrate incoming activity event with full joins
          try {
            const freshData = await api.getInbox(orgSlug, 0, PAGE_SIZE);
            if (freshData) {
              setItems((prev) => {
                const prevMap = new Map(prev.map((p) => [p.id, p]));
                const merged = [...freshData];
                for (const item of prev) {
                  if (!merged.some((m) => m.id === item.id)) {
                    merged.push(item);
                  }
                }
                return merged;
              });
            }
          } catch (err) {
            console.error('Failed to sync realtime inbox update:', err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization?.id, orgSlug]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchInbox(items.length, false);
  };

  const renderActorAvatar = (actor?: InboxItem['actor']) => {
    if (!actor) {
      return (
        <div className="w-6 h-6 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center text-[10px] text-text-muted font-bold shrink-0">
          ?
        </div>
      );
    }

    return (
      <div title={actor.name || actor.email} className="shrink-0">
        <UserAvatar
          name={actor.name}
          email={actor.email}
          avatarUrl={actor.avatar_url}
          size="md"
        />
      </div>
    );
  };

  const renderItemCard = (item: InboxItem) => {
    const { label, icon } = getActionDetails(item.action, item.changes);
    const targetTeam = (item.team_key || teamKey || 'eng').toLowerCase();
    const targetIdentifier = item.issue_identifier || item.issue_id || '';
    const displayIdentifier = item.issue_identifier || 'ISSUE';
    const displayTitle = item.issue_title || 'Untitled Issue';
    const actorName = item.actor?.name || item.actor?.email?.split('@')[0] || 'A team member';

    const cardContent = (
      <div
        className={`p-3.5 rounded-xl border transition-all duration-150 ${
          item.is_deleted
            ? 'bg-panel-dark/40 border-border-subtle opacity-70 cursor-not-allowed select-none'
            : 'bg-panel-dark hover:bg-surface-elevated border-border-subtle hover:border-border-hover cursor-pointer shadow-xs'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {renderActorAvatar(item.actor)}
            <div className="flex items-center gap-1.5 text-xs truncate">
              <span className="font-medium text-text-primary">{actorName}</span>
              <span className="text-text-muted">{label}</span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-text-secondary bg-surface-elevated/70 px-1.5 py-0.5 rounded border border-border-subtle">
                {icon}
                {displayIdentifier}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.is_deleted ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-red-950/40 border border-red-900/50 text-red-400">
                <Trash2 className="w-3 h-3" />
                Deleted
              </span>
            ) : null}
            <span className="text-[11px] text-text-muted font-mono">
              {formatRelativeTime(item.created_at)}
            </span>
          </div>
        </div>

        {/* Issue Details Preview */}
        <div className="mt-2.5 pl-8.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h4
              className={`text-xs font-medium truncate ${
                item.is_deleted ? 'line-through text-text-muted' : 'text-text-primary'
              }`}
            >
              {displayTitle}
            </h4>
          </div>

          {!item.is_deleted && (
            <div className="flex items-center gap-2 shrink-0">
              {item.state && <StateBadge state={item.state} showIcon={true} />}
              {item.priority && (
                <PriorityBadge priority={item.priority} showLabel={false} />
              )}
            </div>
          )}
        </div>
      </div>
    );

    if (item.is_deleted || !targetIdentifier) {
      return (
        <div key={item.id} className="block">
          {cardContent}
        </div>
      );
    }

    return (
      <Link
        key={item.id}
        href={`/${orgSlug}/${targetTeam}/issues/${targetIdentifier}`}
        className="block group"
      >
        {cardContent}
      </Link>
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-canvas-workspace font-sans">
      <TopNav
        title="Inbox"
        subtitle="Activity Feed"
        breadcrumbs={['Workspace', teamKey || 'Team', 'Inbox']}
      />

      <div className="flex-1 overflow-y-auto px-6 py-5 max-w-4xl w-full mx-auto space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
            <span className="text-xs font-mono">Loading activity feed...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border-subtle rounded-xl bg-panel-dark/40 text-center px-4">
            <Inbox className="w-10 h-10 text-text-muted mb-3" />
            <h3 className="text-sm font-medium text-text-primary">No activity yet</h3>
            <p className="text-xs text-text-muted mt-1 max-w-sm">
              When issues are created, modified, commented on, or deleted across teams, notification events will appear here in real-time.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2.5">{items.map(renderItemCard)}</div>

            {hasMore && (
              <div className="pt-3 pb-6 flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full max-w-xs h-9 text-xs bg-panel-dark hover:bg-surface-elevated border-border-subtle hover:border-border-hover text-text-secondary hover:text-text-primary"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                      <span>Loading older activity...</span>
                    </>
                  ) : (
                    <span>Load older activity</span>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}