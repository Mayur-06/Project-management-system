'use client';

import { useEffect, useRef } from 'react';
import { supabase, getClientSessionId } from '@/lib/supabase/client';
import { Issue } from '@/types';

export interface RealtimeEventPayload {
  event: 'issue_created' | 'issue_updated' | 'issue_moved' | 'issue_deleted' | 'comment_added';
  entity: 'issue' | 'comment';
  data: Partial<Issue> & { id: string };
  client_session_id?: string;
}

interface UseRealtimeBoardOptions {
  teamId?: string;
  onIssueCreated?: (issue: Issue) => void;
  onIssueUpdated?: (issue: Issue) => void;
  onIssueMoved?: (update: { id: string; state_id: string; sort_order: string }) => void;
  onIssueDeleted?: (issueId: string) => void;
  onReloadRequested?: () => void;
}

/**
 * Subscribes to Supabase Realtime WebSocket broadcast channels
 * Aligned with plan2/linear_system_implementation_plan.md Section 5:
 * - Scoped Broadcast Channels: realtime:team:{team_id}:board
 * - Self-Echo Suppression: Filters out events originated by current client session
 * - Fallback to Postgres Changes on issues table
 */
export function useRealtimeBoard({
  teamId,
  onIssueCreated,
  onIssueUpdated,
  onIssueMoved,
  onIssueDeleted,
  onReloadRequested,
}: UseRealtimeBoardOptions) {
  const callbacksRef = useRef({
    onIssueCreated,
    onIssueUpdated,
    onIssueMoved,
    onIssueDeleted,
    onReloadRequested,
  });

  useEffect(() => {
    callbacksRef.current = {
      onIssueCreated,
      onIssueUpdated,
      onIssueMoved,
      onIssueDeleted,
      onReloadRequested,
    };
  }, [onIssueCreated, onIssueUpdated, onIssueMoved, onIssueDeleted, onReloadRequested]);

  useEffect(() => {
    if (!teamId) return;

    const currentSessionId = getClientSessionId();
    const channelName = `realtime:team:${teamId}:board`;

    // 1. Initialize Realtime Channel
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    // 2. Listen for Gateway-dispatched broadcast events with echo-suppression
    channel
      .on('broadcast', { event: 'board_mutation' }, ({ payload }) => {
        const eventData = payload as RealtimeEventPayload;
        // Echo-suppression: Ignore events emitted by our own local session
        if (eventData.client_session_id && eventData.client_session_id === currentSessionId) {
          return;
        }

        switch (eventData.event) {
          case 'issue_created':
            callbacksRef.current.onIssueCreated?.(eventData.data as Issue);
            break;
          case 'issue_updated':
            callbacksRef.current.onIssueUpdated?.(eventData.data as Issue);
            break;
          case 'issue_moved':
            callbacksRef.current.onIssueMoved?.({
              id: eventData.data.id,
              state_id: eventData.data.state_id as string,
              sort_order: eventData.data.sort_order as string,
            });
            break;
          case 'issue_deleted':
            callbacksRef.current.onIssueDeleted?.(eventData.data.id);
            break;
          default:
            callbacksRef.current.onReloadRequested?.();
        }
      })
      // 3. Postgres Changes stream (CDC Fallback)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'issues',
          filter: `team_id=eq.${teamId}`,
        },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (row?.last_modified_by_session === currentSessionId) {
            return;
          }

          if (payload.eventType === 'INSERT') {
            callbacksRef.current.onIssueCreated?.(payload.new as Issue);
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.deleted_at) {
              callbacksRef.current.onIssueDeleted?.(payload.new.id);
            } else {
              callbacksRef.current.onIssueUpdated?.(payload.new as Issue);
            }
          } else if (payload.eventType === 'DELETE') {
            callbacksRef.current.onIssueDeleted?.(payload.old.id);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel connected
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId]);
}
