'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Inbox,
  CheckCheck,
  Filter,
  SlidersHorizontal,
  MoreHorizontal,
  ArrowUpRight,
  ExternalLink,
  MessageSquare,
  PlusCircle,
  Edit3,
  Trash2,
  Paperclip,
  Clock,
  Circle,
  Check,
  CheckCircle2,
  User,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { InboxItem, Team } from '@/types';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { StateBadge } from '@/components/ui/StateBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { toast } from 'sonner';

function formatShortTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 60) return 'now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) return `${diffWeeks}w`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function InboxTrayIcon({ className = 'w-18 h-18 text-zinc-600' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer rounded perspective body */}
      <rect
        x="22"
        y="16"
        width="36"
        height="28"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {/* Slanted lower base with cutout pull notch */}
      <path
        d="M22 40L24.5 55C24.8 57.2 26.7 59 29 59H34C35.1 59 36 58.1 36 57C36 55.9 36.9 55 38 55H42C43.1 55 44 55.9 44 57C44 58.1 44.9 59 46 59H51C53.3 59 55.2 57.2 55.5 55L58 40"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Top paper indicator */}
      <path
        d="M29 24H51"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

function LinearBrandIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" className="text-white/20" />
      <path d="M7 16L17 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white" />
      <path d="M6 12L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/70" />
      <path d="M12 18L18 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/70" />
    </svg>
  );
}

const PAGE_SIZE = 50;

export default function WorkspaceInboxPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const { organization, teams } = useWorkspace();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Load read notifications from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && orgSlug) {
      try {
        const stored = localStorage.getItem(`linear_inbox_read_${orgSlug}`);
        if (stored) {
          setReadIds(new Set(JSON.parse(stored)));
        }
      } catch {
        // Ignore JSON error
      }
    }
  }, [orgSlug]);

  const saveReadIds = useCallback((newReadSet: Set<string>) => {
    setReadIds(newReadSet);
    if (typeof window !== 'undefined' && orgSlug) {
      try {
        localStorage.setItem(`linear_inbox_read_${orgSlug}`, JSON.stringify(Array.from(newReadSet)));
      } catch {
        // Ignore storage error
      }
    }
  }, [orgSlug]);

  const fetchInbox = useCallback(
    async (offset = 0, isInitial = false) => {
      if (!orgSlug) return;
      try {
        if (isInitial) setIsLoading(true);
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

        setHasMore(fetched.length >= PAGE_SIZE);
      } catch (err) {
        console.error('Failed to fetch inbox activity:', err);
      } finally {
        if (isInitial) setIsLoading(false);
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
          try {
            const freshData = await api.getInbox(orgSlug, 0, PAGE_SIZE);
            if (freshData) {
              setItems((prev) => {
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

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = [...items];
    if (filterUnreadOnly) {
      result = result.filter((item) => !readIds.has(item.id));
    }
    if (sortOrder === 'oldest') {
      result.reverse();
    }
    return result;
  }, [items, filterUnreadOnly, readIds, sortOrder]);

  const selectedItem = selectedIndex >= 0 && selectedIndex < filteredItems.length
    ? filteredItems[selectedIndex]
    : null;

  // Handle Mark Read / Toggle
  const handleToggleRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextSet = new Set(readIds);
    if (nextSet.has(id)) {
      nextSet.delete(id);
      toast.info('Marked as unread');
    } else {
      nextSet.add(id);
      toast.info('Marked as read');
    }
    saveReadIds(nextSet);
  };

  const handleMarkAllRead = () => {
    const nextSet = new Set(readIds);
    items.forEach((item) => nextSet.add(item.id));
    saveReadIds(nextSet);
    toast.success('All notifications marked as read');
  };

  const handleOpenIssue = (item: InboxItem) => {
    if (!item.issue_identifier) return;
    const teamKey = item.team_key?.toLowerCase() || (teams[0]?.key?.toLowerCase() || 'eng');
    router.push(`/${orgSlug}/${teamKey}/issues/${item.issue_identifier}`);
  };

  // Keyboard navigation shortcuts: J/K, Up/Down, Enter/O, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (filteredItems.length === 0) return -1;
          const next = prev < filteredItems.length - 1 ? prev + 1 : prev;
          if (next >= 0 && filteredItems[next]) {
            // Optimistically mark as read upon focus
            const nextSet = new Set(readIds);
            nextSet.add(filteredItems[next].id);
            saveReadIds(nextSet);
          }
          return next;
        });
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (filteredItems.length === 0) return -1;
          const next = prev > 0 ? prev - 1 : 0;
          if (next >= 0 && filteredItems[next]) {
            const nextSet = new Set(readIds);
            nextSet.add(filteredItems[next].id);
            saveReadIds(nextSet);
          }
          return next;
        });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedIndex(-1);
      } else if ((e.key === 'Enter' || e.key.toLowerCase() === 'o') && selectedItem) {
        e.preventDefault();
        handleOpenIssue(selectedItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedItem, readIds, saveReadIds]);

  // Derive preview text for an inbox item
  const getItemDetails = (item: InboxItem) => {
    const actorName = item.actor?.name || item.actor?.email?.split('@')[0] || 'A teammate';
    let summaryText = '';

    switch (item.action) {
      case 'issue_created':
        summaryText = `${actorName} created this issue`;
        break;
      case 'comment_created':
        summaryText = `${actorName} added a comment`;
        break;
      case 'issue_updated':
        if (item.changes?.state) {
          summaryText = `${actorName} updated state to ${item.changes.state.name || 'new state'}`;
        } else if (item.changes?.priority) {
          summaryText = `${actorName} changed priority to ${item.changes.priority}`;
        } else if (item.changes?.assignee_id) {
          summaryText = `${actorName} reassigned this issue`;
        } else {
          summaryText = `${actorName} updated issue details`;
        }
        break;
      case 'attachment_uploaded':
        summaryText = `${actorName} attached a file`;
        break;
      case 'issue_deleted':
        summaryText = `${actorName} deleted this issue`;
        break;
      default:
        summaryText = `${actorName} made an update`;
    }

    return {
      actorName,
      summaryText,
      title: item.issue_title || item.issue_identifier || 'Issue notification',
      identifier: item.issue_identifier || 'ISSUE',
    };
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#08090a] font-sans select-none">
      {/* ============================================================== */}
      {/* LEFT PANE: MASTER NOTIFICATIONS LIST (~w-88 to w-96)           */}
      {/* ============================================================== */}
      <aside className="w-80 sm:w-88 md:w-96 shrink-0 h-full border-r border-[#1e2025] bg-[#08090a] flex flex-col z-10">
        {/* Top Header matching Screenshot */}
        <div className="h-12 px-4 border-b border-[#1e2025] flex items-center justify-between bg-[#08090a] shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white tracking-tight">Inbox</h1>
            <button
              type="button"
              className="p-1 text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded transition-colors cursor-pointer"
              title="More options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded transition-colors cursor-pointer"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFilterUnreadOnly((prev) => !prev)}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                filterUnreadOnly
                  ? 'text-[#7170ff] bg-[#5e6ad2]/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={filterUnreadOnly ? 'Showing unread only' : 'Filter notifications'}
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded transition-colors cursor-pointer"
              title={`Sort: ${sortOrder}`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Indicator Bar if active */}
        {filterUnreadOnly && (
          <div className="px-4 py-1.5 bg-[#0f1011] border-b border-[#1e2025] flex items-center justify-between text-[11px] text-zinc-400">
            <span>Filtered: Unread only</span>
            <button
              onClick={() => setFilterUnreadOnly(false)}
              className="text-[10px] text-[#7170ff] hover:underline"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Notifications Scroll Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#1e2025]/60 focus:outline-none">
          {isLoading ? (
            /* Skeleton Loading State */
            <div className="p-3 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-2.5 rounded-lg bg-white/[0.02] border border-[#1e2025]/40 space-y-2 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white/[0.08]" />
                      <div className="w-32 h-3.5 bg-white/[0.06] rounded" />
                    </div>
                    <div className="w-8 h-2.5 bg-white/[0.04] rounded" />
                  </div>
                  <div className="w-48 h-2.5 bg-white/[0.04] rounded pl-8" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
              <Inbox className="w-8 h-8 text-zinc-600 mb-2 stroke-1" />
              <p className="text-xs font-medium text-zinc-400">No notifications</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {filterUnreadOnly ? 'No unread notifications' : 'Your inbox is completely caught up'}
              </p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = selectedIndex === idx;
              const isUnread = !readIds.has(item.id);
              const details = getItemDetails(item);
              const timeDisplay = formatShortTime(item.created_at);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedIndex(idx);
                    // Mark as read on click
                    const nextSet = new Set(readIds);
                    nextSet.add(item.id);
                    saveReadIds(nextSet);
                  }}
                  className={`px-3 py-3 flex items-start gap-3 transition-colors cursor-pointer group relative ${
                    isSelected
                      ? 'bg-white/[0.08] text-white border-l-2 border-[#5e6ad2]'
                      : 'hover:bg-white/[0.03] text-zinc-300'
                  }`}
                >
                  {/* Unread dot or subtle avatar icon */}
                  <div className="relative shrink-0 mt-0.5">
                    {item.actor ? (
                      <UserAvatar
                        name={item.actor.name}
                        email={item.actor.email}
                        avatarUrl={item.actor.avatar_url}
                        size="sm"
                      />
                    ) : (
                      <LinearBrandIcon className="w-6 h-6" />
                    )}

                    {isUnread && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#5e6ad2] ring-2 ring-[#08090a]" />
                    )}
                  </div>

                  {/* Notification Content Summary */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs truncate font-medium ${isUnread ? 'text-white font-semibold' : 'text-zinc-300'}`}>
                        {details.title}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-1">
                        {timeDisplay}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {details.summaryText}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          {hasMore && !isLoading && (
            <div className="p-3 text-center">
              <button
                type="button"
                onClick={() => fetchInbox(items.length, false)}
                disabled={loadingMore}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.05] transition-colors"
              >
                {loadingMore ? 'Loading older...' : 'Load more notifications'}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ============================================================== */}
      {/* RIGHT PANE: DETAIL PREVIEW OR EMPTY WIREFRAME TRAY             */}
      {/* ============================================================== */}
      <section className="flex-1 flex flex-col h-full bg-black min-w-0 overflow-hidden relative">
        {selectedItem ? (
          /* ========================================================== */
          /* SELECTED NOTIFICATION DETAIL VIEW                          */
          /* ========================================================== */
          <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in duration-150">
            {/* Top Preview Action Bar */}
            <div className="h-12 px-6 border-b border-[#1e2025] flex items-center justify-between bg-[#08090a]/60 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-3">
                <span
                  onClick={() => handleOpenIssue(selectedItem)}
                  className="font-mono text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 group"
                  title="Open issue page"
                >
                  <span>{selectedItem.issue_identifier || 'ISSUE'}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>

                {selectedItem.state && (
                  <StateBadge state={selectedItem.state} />
                )}

                {selectedItem.priority && (
                  <PriorityBadge priority={selectedItem.priority} />
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleRead(selectedItem.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer border border-[#1e2025]"
                  title={readIds.has(selectedItem.id) ? 'Mark as unread' : 'Mark as read'}
                >
                  {readIds.has(selectedItem.id) ? (
                    <>
                      <Circle className="w-3.5 h-3.5" />
                      <span>Mark unread</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Mark read</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenIssue(selectedItem)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#5e6ad2] hover:bg-[#7170ff] text-white text-xs font-medium transition-colors cursor-pointer shadow-xs"
                >
                  <span>Open issue</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content Pane */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 max-w-4xl">
              {/* Event Activity Banner Card */}
              <div className="p-5 rounded-xl bg-[#0f1011] border border-[#1e2025] space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={selectedItem.actor?.name}
                      email={selectedItem.actor?.email}
                      avatarUrl={selectedItem.actor?.avatar_url}
                      size="md"
                    />
                    <div>
                      <div className="text-xs font-medium text-white flex items-center gap-1.5">
                        <span className="font-semibold">{selectedItem.actor?.name || selectedItem.actor?.email || 'System'}</span>
                        <span className="text-zinc-400 font-normal">
                          {selectedItem.action === 'comment_created'
                            ? 'commented on this issue'
                            : selectedItem.action === 'issue_created'
                            ? 'created this issue'
                            : selectedItem.action === 'issue_updated'
                            ? 'updated properties'
                            : 'updated this issue'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                        {new Date(selectedItem.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* If changes exist (e.g. state change) */}
                {selectedItem.changes && Object.keys(selectedItem.changes).length > 0 && (
                  <div className="pt-3 border-t border-[#1e2025] text-xs text-zinc-300 space-y-1">
                    {selectedItem.changes.state && (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Status:</span>
                        <span className="text-white font-medium">{selectedItem.changes.state.name}</span>
                      </div>
                    )}
                    {selectedItem.changes.priority && (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Priority:</span>
                        <span className="text-white capitalize font-medium">{selectedItem.changes.priority}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Issue Preview Overview Card */}
              <div className="p-6 rounded-xl bg-[#0f1011] border border-[#1e2025] space-y-4">
                <div className="space-y-1">
                  <span className="text-xs font-mono text-zinc-500">{selectedItem.issue_identifier}</span>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {selectedItem.issue_title || 'Untitled Issue'}
                  </h2>
                </div>

                <div className="pt-4 border-t border-[#1e2025] flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[10px]">Enter</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[10px]">O</kbd> to view full issue details.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenIssue(selectedItem)}
                    className="flex items-center gap-1.5 text-xs text-[#7170ff] hover:text-white transition-colors cursor-pointer"
                  >
                    <span>View full conversation</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================== */
          /* EMPTY WIREFRAME TRAY STATE (MATCHING USER SCREENSHOT)      */
          /* ========================================================== */
          <div className="flex-1 flex flex-col items-center justify-center select-none animate-in fade-in duration-200">
            <InboxTrayIcon className="w-20 h-20 text-zinc-700/80 mb-3" />
            <p className="text-xs font-medium text-zinc-500 tracking-wide">
              No notification selected
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
