import {
  Issue,
  WorkflowState,
  IssueComment,
  ActivityLog,
  Team,
  Organization,
  WorkspaceMember,
  IssueAttachment,
  UserWorkspaceItem,
  UserWorkspacesResponse,
  InboxItem,
  Label,
} from '@/types';
import { getClientSessionId, supabase } from '@/lib/supabase/client';

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

// Memory token cache for high-frequency low-latency requests
let memoizedToken: string | null = null;
let tokenExpiry: number = 0;

export function setMemoizedToken(token: string | null, expiresAt?: number): void {
  memoizedToken = token;
  tokenExpiry = expiresAt || (token ? Math.floor(Date.now() / 1000) + 3600 : 0);
}

export function clearMemoizedToken(): void {
  memoizedToken = null;
  tokenExpiry = 0;
}

export async function getValidToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);

  // 1. In-memory fast path (bypasses Supabase async storage lock entirely)
  if (memoizedToken && tokenExpiry - now > 60) {
    return memoizedToken;
  }

  // 2. Fast synchronous localStorage read before async getSession()
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('supabase_access_token');
    if (local && !local.includes('dev_sig')) {
      memoizedToken = local;
      tokenExpiry = now + 1800; // 30 min default validity
      return memoizedToken;
    }
  }

  // 3. Fallback to Supabase async storage lock ONLY when cache is empty or expired
  if (typeof window !== 'undefined') {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        memoizedToken = data.session.access_token;
        tokenExpiry = data.session.expires_at || (now + 3600);
        localStorage.setItem('supabase_access_token', memoizedToken);
        return memoizedToken;
      }
    } catch {}
  }

  // 4. Cookie fallback
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
    if (match && !match[1].includes('dev_sig')) {
      memoizedToken = match[1];
      tokenExpiry = now + 1800;
      return memoizedToken;
    }
  }

  return null;
}

// In-flight GET request deduplication map
const inflightRequests = new Map<string, Promise<unknown>>();

async function fetchWithAuthCore<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  let token: string | null = await getValidToken();

  // Fallback: custom Authorization headers
  if (!token && options.headers) {
    let authHeader = '';
    if (options.headers instanceof Headers) {
      authHeader = options.headers.get('Authorization') || '';
    } else if (typeof options.headers === 'object') {
      authHeader = (options.headers as Record<string, string>)['Authorization'] || '';
    }
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    }
  }

  // If token is invalid dev placeholder, clean up
  if (token && token.includes('dev_sig')) {
    clearMemoizedToken();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('supabase_access_token');
      document.cookie = 'sb-access-token=; path=/; max-age=0';
    }
    token = null;
  }

  // If no auth token is present, skip sending unauthenticated requests
  if (!token) {
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${getApiBase()}${endpoint}`, {
      ...options,
      headers,
    });
    if (!response.ok) {
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          try {
            const { data } = await supabase.auth.refreshSession();
            if (data?.session?.access_token) {
              const newToken = data.session.access_token;
              setMemoizedToken(newToken, data.session.expires_at || undefined);
              localStorage.setItem('supabase_access_token', newToken);
              document.cookie = `sb-access-token=${newToken}; path=/; max-age=604800; SameSite=Lax`;
              const retryResponse = await fetch(`${getApiBase()}${endpoint}`, {
                ...options,
                headers: {
                  ...headers,
                  Authorization: `Bearer ${newToken}`,
                },
              });
              if (retryResponse.ok) {
                return (await retryResponse.json()) as T;
              }
            }
          } catch {}
          clearMemoizedToken();
          localStorage.removeItem('supabase_access_token');
          document.cookie = 'sb-access-token=; path=/; max-age=0';
        }
        throw new Error('Unauthorized');
      }
      if (response.status === 404 && (!options.method || options.method === 'GET')) {
        return null;
      }
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.detail;
      const message = errJson?.message;
      let errorMsg: string | null = null;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (detail && typeof detail === 'object') {
        errorMsg = detail.message || (Array.isArray(detail) ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ') : JSON.stringify(detail));
      } else if (message) {
        errorMsg = typeof message === 'string' ? message : JSON.stringify(message);
      }
      if (errorMsg) {
        throw new Error(errorMsg);
      }
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.message) {
      throw err;
    }
    return null;
  }
}

/**
 * Deduplicates concurrent identical GET requests, returning the active Promise.
 * Non-GET mutation requests bypass deduplication and execute immediately.
 */
async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  const method = (options.method || 'GET').toUpperCase();

  if (method !== 'GET') {
    return fetchWithAuthCore<T>(endpoint, options);
  }

  const cacheKey = `GET:${endpoint}`;
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey) as Promise<T | null>;
  }

  const promise = fetchWithAuthCore<T>(endpoint, options).finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, promise);
  return promise;
}

// ─────────────────────────────────────────────────────────────
// SWR In-Memory Cache
// ─────────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const issueLookupCache = new Map<string, Issue>();
const issuesByTeamCache = new Map<string, Issue[]>();

const DEFAULT_SWR_TTL_MS = 30_000; // 30s fresh window
const MAX_STALE_TTL_MS = 5 * 60_000; // 5min stale revalidation window

export function getCachedData<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  return entry.data as T;
}

export function setCachedData<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    memoryCache.clear();
    issueLookupCache.clear();
    issuesByTeamCache.clear();
    return;
  }
  for (const key of Array.from(memoryCache.keys())) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Executes a GET request with Stale-While-Revalidate semantics.
 * If data is cached and within fresh TTL, returns cached data immediately (0ms).
 * If data is stale, returns cached data immediately while revalidating in the background.
 * If data is not cached, fetches synchronously and caches.
 */
async function fetchWithAuthSWR<T>(endpoint: string, options: RequestInit = {}, ttlMs: number = DEFAULT_SWR_TTL_MS): Promise<T | null> {
  const cacheKey = `SWR:${endpoint}`;
  const now = Date.now();
  const entry = memoryCache.get(cacheKey) as CacheEntry<T> | undefined;

  if (entry) {
    const age = now - entry.timestamp;
    if (age < ttlMs) {
      // 0ms instant cache hit
      return entry.data;
    }

    if (age < MAX_STALE_TTL_MS) {
      // Stale-while-revalidate: return stale data immediately, revalidate in background
      fetchWithAuth<T>(endpoint, options).then((freshData) => {
        if (freshData !== null) {
          memoryCache.set(cacheKey, { data: freshData, timestamp: Date.now() });
        }
      }).catch(() => {});
      return entry.data;
    }
  }

  // Cold fetch
  const freshData = await fetchWithAuth<T>(endpoint, options);
  if (freshData !== null) {
    memoryCache.set(cacheKey, { data: freshData, timestamp: Date.now() });
  }
  return freshData;
}

export interface SignInResponse {
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  };
  session: {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    expires_in?: number | null;
    expires_at?: number | null;
  };
}

export async function establishClientSession(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
}): Promise<void> {
  setMemoizedToken(session.access_token, session.expires_at || undefined);
  if (typeof window !== 'undefined') {
    localStorage.setItem('supabase_access_token', session.access_token);
    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=604800; SameSite=Lax`;
    try {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    } catch (err) {
      console.warn('Supabase setSession hydration error:', err);
    }
  }
}

export const api = {
  // Auth
  async signin(email: string, password: string): Promise<SignInResponse> {
    const response = await fetch(`${getApiBase()}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail =
        errJson?.detail ||
        errJson?.message ||
        'Authentication failed. Please check your credentials.';
      throw new Error(detail);
    }

    return (await response.json()) as SignInResponse;
  },

  async login(email: string, password: string): Promise<SignInResponse> {
    return this.signin(email, password);
  },

  async register(name: string, email: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${getApiBase()}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const detail = errJson?.detail || errJson?.message;
        if (detail) {
          throw new Error(detail);
        }
        return false;
      }
      return true;
    } catch (err: any) {
      if (err instanceof Error && err.message) {
        throw err;
      }
      return false;
    }
  },

  async setPassword(email: string, password: string, name: string = ''): Promise<boolean> {
    try {
      const response = await fetch(`${getApiBase()}/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // Workspaces & Teams
  async getMyWorkspaces(authToken?: string): Promise<UserWorkspaceItem[]> {
    const options: RequestInit = authToken
      ? { headers: { Authorization: `Bearer ${authToken}` } }
      : {};
    const data = await fetchWithAuth<UserWorkspacesResponse>('/workspaces/me', options);
    return data?.workspaces || [];
  },

  async createWorkspace(name: string, slug: string): Promise<Organization | null> {
    return await fetchWithAuth<Organization>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    });
  },

  async createTeam(
    orgSlug: string,
    teamData: { name: string; key: string }
  ): Promise<Team | null> {
    return await fetchWithAuth<Team>(`/workspaces/${orgSlug}/teams`, {
      method: 'POST',
      body: JSON.stringify(teamData),
    });
  },

  async getWorkspace(orgSlug: string): Promise<Organization | null> {
    return await fetchWithAuthSWR<Organization>(`/workspaces/${orgSlug}`);
  },

  async updateWorkspace(orgSlug: string, updates: Partial<Organization>): Promise<Organization | null> {
    const res = await fetchWithAuth<Organization>(`/workspaces/${orgSlug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (res) {
      invalidateCache(`/workspaces/${orgSlug}`);
    }
    return res;
  },

  async getWorkspaceMembers(orgSlug: string): Promise<WorkspaceMember[]> {
    const data = await fetchWithAuthSWR<WorkspaceMember[]>(`/workspaces/${orgSlug}/members`);
    return data || [];
  },

  async inviteMember(
    orgSlug: string,
    email: string,
    role: string = 'member'
  ): Promise<WorkspaceMember | null> {
    return await fetchWithAuth<WorkspaceMember>(`/workspaces/${orgSlug}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  // Settings
  async getUserProfile(): Promise<any | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
  },

  async updateCurrentUserProfile(name?: string, jobDescription?: string): Promise<boolean> {
    const dataToUpdate: Record<string, any> = {};
    if (name !== undefined) dataToUpdate.full_name = name;
    if (jobDescription !== undefined) dataToUpdate.job_description = jobDescription;

    const { error } = await supabase.auth.updateUser({
      data: dataToUpdate,
    });
    return !error;
  },

  async getWorkspaceSettings(orgSlug: string): Promise<Organization | null> {
    return await fetchWithAuth<Organization>(`/workspaces/${orgSlug}`);
  },

  async updateWorkspaceSettings(orgSlug: string, updates: Partial<Organization>): Promise<Organization | null> {
    return await fetchWithAuth<Organization>(`/workspaces/${orgSlug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getWorkspaceMembersSettings(orgSlug: string): Promise<WorkspaceMember[]> {
    const data = await fetchWithAuth<WorkspaceMember[]>(`/workspaces/${orgSlug}/members`);
    return data || [];
  },

  async inviteWorkspaceMember(orgSlug: string, email: string, role: string = 'member'): Promise<WorkspaceMember | null> {
    return await fetchWithAuth<WorkspaceMember>(`/workspaces/${orgSlug}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  async getTeams(orgSlug: string, authToken?: string): Promise<Team[]> {
    const options: RequestInit = authToken
      ? { headers: { Authorization: `Bearer ${authToken}` } }
      : {};
    const data = await fetchWithAuthSWR<Team[]>(`/workspaces/${orgSlug}/teams`, options);
    return data || [];
  },

  async updateTeam(teamId: string, updates: Partial<Team>): Promise<Team | null> {
    const res = await fetchWithAuth<Team>(`/teams/${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (res) {
      invalidateCache(`/teams/${teamId}`);
      invalidateCache('/teams');
    }
    return res;
  },

  async getTeamMembers(teamId: string): Promise<any[]> {
    const data = await fetchWithAuthSWR<any[]>(`/teams/${teamId}/members`);
    return data || [];
  },

  async addTeamMember(teamId: string, userId: string): Promise<any | null> {
    const res = await fetchWithAuth<any>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
    invalidateCache(`/teams/${teamId}/members`);
    return res;
  },

  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    await fetchWithAuth<any>(`/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    });
    invalidateCache(`/teams/${teamId}/members`);
    return true;
  },

  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    const data = await fetchWithAuthSWR<WorkflowState[]>(`/teams/${teamId}/states`);
    return data || [];
  },

  // Issues
  async getIssues(params?: { teamId?: string; stateId?: string }): Promise<Issue[]> {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('team_id', params.teamId);
    if (params?.stateId) query.append('state_id', params.stateId);

    const qs = query.toString();
    const endpoint = `/issues${qs ? `?${qs}` : ''}`;
    const data = await fetchWithAuthSWR<Issue[]>(endpoint);
    const issues = data || [];

    // Seed individual lookups
    for (const item of issues) {
      if (item.id) issueLookupCache.set(item.id, item);
      if (item.identifier) issueLookupCache.set(item.identifier.toUpperCase(), item);
    }
    if (params?.teamId) {
      issuesByTeamCache.set(params.teamId, issues);
    }
    return issues;
  },

  async getInbox(orgSlug: string, offset = 0, limit = 50): Promise<InboxItem[] | null> {
    return await fetchWithAuth<InboxItem[]>(`/organizations/${orgSlug}/inbox?offset=${offset}&limit=${limit}`);
  },

  async getIssue(idOrKey: string): Promise<Issue | null> {
    const cached = issueLookupCache.get(idOrKey) || issueLookupCache.get(idOrKey.toUpperCase());
    const data = await fetchWithAuthSWR<Issue>(`/issues/${idOrKey}`);
    const result = data || cached || null;
    if (result) {
      if (result.id) issueLookupCache.set(result.id, result);
      if (result.identifier) issueLookupCache.set(result.identifier.toUpperCase(), result);
    }
    return result;
  },

  async createIssue(issue: Partial<Issue> & { label_ids?: string[] }): Promise<Issue | null> {
    const sessionId = getClientSessionId();
    const created = await fetchWithAuth<Issue>(`/issues`, {
      method: 'POST',
      body: JSON.stringify({ ...issue, client_session_id: sessionId }),
    });
    if (created) {
      this.setCachedIssue(created);
      invalidateCache('/issues');
    }
    return created;
  },

  async updateIssue(id: string, updates: Partial<Issue> & { expected_version?: number; label_ids?: string[] }): Promise<Issue | null> {
    const sessionId = getClientSessionId();
    const updated = await fetchWithAuth<Issue>(`/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, client_session_id: sessionId }),
    });
    if (updated) {
      this.setCachedIssue(updated);
      invalidateCache('/issues');
    }
    return updated;
  },

  async reorderIssue(
    id: string,
    state_id?: string,
    prev_position?: string,
    next_position?: string
  ): Promise<Issue | null> {
    const sessionId = getClientSessionId();
    const reordered = await fetchWithAuth<Issue>(`/issues/${id}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({
        state_id,
        prev_position,
        next_position,
        client_session_id: sessionId,
      }),
    });
    if (reordered) {
      this.setCachedIssue(reordered);
      invalidateCache('/issues');
    }
    return reordered;
  },

  async createSubtask(
    issueId: string,
    subtask: { title: string; assignee_id?: string; priority?: string }
  ): Promise<Issue | null> {
    return await fetchWithAuth<Issue>(`/issues/${issueId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify(subtask),
    });
  },

  async deleteIssue(id: string, hard: boolean = false): Promise<boolean> {
    const sessionId = getClientSessionId();
    const token = typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
    try {
      const response = await fetch(
        `${API_BASE}/issues/${id}?hard=${hard}&client_session_id=${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      if (response.ok) {
        issueLookupCache.delete(id);
        invalidateCache('/issues');
      }
      return response.ok;
    } catch {
      return false;
    }
  },

  // Comments
  async getComments(issueId: string): Promise<IssueComment[]> {
    const data = await fetchWithAuth<IssueComment[]>(`/issues/${issueId}/comments`);
    return data || [];
  },

  async addComment(issueId: string, bodyText: string): Promise<IssueComment | null> {
    return await fetchWithAuth<IssueComment>(`/issues/${issueId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body_text: bodyText,
        body_json: { type: 'doc', content: [] },
      }),
    });
  },

  async updateComment(commentId: string, bodyText: string): Promise<IssueComment | null> {
    return await fetchWithAuth<IssueComment>(`/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        body_text: bodyText,
        body_json: { type: 'doc', content: [] },
      }),
    });
  },

  async deleteComment(commentId: string, hard = true): Promise<boolean> {
    try {
      await fetchWithAuth(`/comments/${commentId}?hard=${hard}`, {
        method: 'DELETE',
      });
      return true;
    } catch {
      return false;
    }
  },

  // Activity
  async getActivityLogs(issueId: string): Promise<ActivityLog[]> {
    const data = await fetchWithAuth<ActivityLog[]>(`/issues/${issueId}/activity`);
    return data || [];
  },

  // AI Duplicates Check
  async checkDuplicates(
    title: string,
    organizationId?: string
  ): Promise<{ duplicates: { id: string; title: string; similarity: number; identifier?: string }[] }> {
    const data = await fetchWithAuth<any>(
      `/ai/duplicates/check`,
      {
        method: 'POST',
        body: JSON.stringify({
          title,
          ...(organizationId ? { organization_id: organizationId } : {}),
        }),
      }
    );
    const rawMatches = data?.matches || data?.duplicates || [];
    return {
      duplicates: rawMatches.map((m: any) => ({
        id: m.issue_id || m.id,
        identifier: m.identifier,
        title: m.title,
        similarity: m.similarity,
      })),
    };
  },

  // AI Sub-task Breakdown
  async startBreakdown(
    issueId: string,
    threadId?: string
  ): Promise<{ thread_id: string; prdspec?: string; proposed_subtasks?: any[]; proposed_tasks?: string[] } | null> {
    const res = await fetchWithAuth<any>(`/ai/breakdown/start`, {
      method: 'POST',
      body: JSON.stringify({ issue_id: issueId, thread_id: threadId }),
    });
    if (!res) return null;
    const proposed = res.proposed_subtasks || res.proposed_tasks || [];
    return {
      thread_id: res.thread_id,
      prdspec: res.prdspec,
      proposed_subtasks: proposed,
      proposed_tasks: proposed.map((p: any) => (typeof p === 'string' ? p : p.title)),
    };
  },

  async resumeBreakdown(
    threadId: string,
    approvedTasks: (string | { title: string; description?: string; priority?: string })[]
  ): Promise<Issue[] | null> {
    const formatted = approvedTasks.map((t) =>
      typeof t === 'string'
        ? { title: t, description: '', priority: 'medium' }
        : t
    );
    return await fetchWithAuth(`/ai/breakdown/resume`, {
      method: 'POST',
      body: JSON.stringify({
        thread_id: threadId,
        approved_subtasks: formatted,
        approved_tasks: formatted,
      }),
    });
  },

  // Labels
  async getLabels(organizationId: string): Promise<Label[]> {
    const data = await fetchWithAuthSWR<Label[]>(`/labels?organization_id=${encodeURIComponent(organizationId)}`);
    return data || [];
  },

  async attachLabel(issueId: string, labelId: string): Promise<any> {
    return await fetchWithAuth(`/issues/${issueId}/labels/${labelId}`, {
      method: 'POST',
    });
  },

  async detachLabel(issueId: string, labelId: string): Promise<any> {
    return await fetchWithAuth(`/issues/${issueId}/labels/${labelId}`, {
      method: 'DELETE',
    });
  },

  // Attachments
  async getAttachments(issueId: string): Promise<IssueAttachment[]> {
    const data = await fetchWithAuth<IssueAttachment[]>(`/issues/${issueId}/attachments`);
    return data || [];
  },

  async getUploadUrl(
    issueId: string,
    fileName: string,
    fileSize: number,
    mimeType: string
  ): Promise<{ attachment_id: string; issue_id: string; upload_url: string; storage_path: string; file_name: string; file_url?: string } | null> {
    return await fetchWithAuth(`/attachments/upload-url`, {
      method: 'POST',
      body: JSON.stringify({
        issue_id: issueId,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
      }),
    });
  },

  async deleteAttachment(attachmentId: string): Promise<boolean> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
    try {
      const response = await fetch(`${API_BASE}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  // AI Chat & ReAct Agent
  async confirmChatAction(payload: {
    action: string;
    issue_id?: string;
    team_id?: string;
    title?: string;
    description?: string;
    priority?: string;
    target_state_id?: string;
    target_assignee_id?: string;
  }): Promise<{ status: string; action: string; issue_id?: string; issue_identifier?: string; message: string; result?: any } | null> {
    return await fetchWithAuth(`/ai/chat/action/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async streamChat(
    payload: { organization_id: string; messages: { role: string; content: string }[] },
    onEvent: (event: { type: string; data: any }) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const token = await getValidToken();
    const response = await fetch(`${API_BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to stream chat: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEvent = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.replace('event:', '').trim();
        } else if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.replace('data:', '').trim();
          try {
            const parsed = JSON.parse(jsonStr);
            onEvent({ type: currentEvent, data: parsed });
          } catch {
            onEvent({ type: currentEvent, data: jsonStr });
          }
        } else if (trimmed === '') {
          currentEvent = 'message';
        }
      }
    }
  },

  // ─────────────────────────────────────────────────────────────
  // Synchronous Cache Accessors
  // ─────────────────────────────────────────────────────────────
  getCachedIssue(idOrIdentifier: string): Issue | null {
    if (!idOrIdentifier) return null;
    return issueLookupCache.get(idOrIdentifier) || issueLookupCache.get(idOrIdentifier.toUpperCase()) || null;
  },

  setCachedIssue(issue: Issue): void {
    if (!issue) return;
    if (issue.id) issueLookupCache.set(issue.id, issue);
    if (issue.identifier) issueLookupCache.set(issue.identifier.toUpperCase(), issue);

    if (issue.team_id && issuesByTeamCache.has(issue.team_id)) {
      const list = issuesByTeamCache.get(issue.team_id)!;
      const idx = list.findIndex((i) => i.id === issue.id || (i.identifier && i.identifier === issue.identifier));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...issue };
      } else {
        list.unshift(issue);
      }
    }
  },

  getCachedIssues(teamId: string): Issue[] | null {
    return issuesByTeamCache.get(teamId) || null;
  },

  invalidateCache(pattern?: string): void {
    invalidateCache(pattern);
  },
};
