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
} from '@/types';
import { getClientSessionId, supabase } from '@/lib/supabase/client';

function getApiBase(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' && envUrl.includes('127.0.0.1')) {
      return envUrl.replace('127.0.0.1', 'localhost');
    }
    if (window.location.hostname === '127.0.0.1' && envUrl.includes('localhost')) {
      return envUrl.replace('localhost', '127.0.0.1');
    }
  }
  return envUrl;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  let token = typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
  // If token is missing from localStorage, check cookie
  if (!token && typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
    if (match) token = match[1];
  }

  // Check if token was provided in custom headers
  if (!token && options.headers) {
    let authHeader = '';
    if (options.headers instanceof Headers) {
      authHeader = options.headers.get('Authorization') || '';
    } else if (typeof options.headers === 'object') {
      authHeader = (options.headers as any)['Authorization'] || '';
    }
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    }
  }

  // Fall back to active Supabase session if still missing
  if (!token && typeof window !== 'undefined') {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        token = data.session.access_token;
        localStorage.setItem('supabase_access_token', token);
      }
    } catch {}
  }

  // If token is the old placeholder dev token, clear it
  if (token && token.includes('dev_sig')) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('supabase_access_token');
      document.cookie = 'sb-access-token=; path=/; max-age=0';
    }
    token = null;
  }

  // If no auth token is present, skip sending unauthenticated requests to protected endpoints
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
          localStorage.removeItem('supabase_access_token');
          document.cookie = 'sb-access-token=; path=/; max-age=0';
        }
        throw new Error('Unauthorized');
      }
      if (response.status === 404 && (!options.method || options.method === 'GET')) {
        return null;
      }
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.detail || errJson?.message;
      if (detail) {
        throw new Error(detail);
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

export const api = {
  // Auth
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
    return await fetchWithAuth<Organization>(`/workspaces/${orgSlug}`);
  },

  async updateWorkspace(orgSlug: string, updates: Partial<Organization>): Promise<Organization | null> {
    return await fetchWithAuth<Organization>(`/workspaces/${orgSlug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getWorkspaceMembers(orgSlug: string): Promise<WorkspaceMember[]> {
    const data = await fetchWithAuth<WorkspaceMember[]>(`/workspaces/${orgSlug}/members`);
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
    return await fetchWithAuth<any>(`/users/me/profile`);
  },

  async getWorkspaceSettings(orgSlug: string): Promise<Organization | null> {
    return await fetchWithAuth<Organization>(`/organizations/${orgSlug}/settings/workspace`);
  },

  async updateWorkspaceSettings(orgSlug: string, updates: Partial<Organization>): Promise<Organization | null> {
    return await fetchWithAuth<Organization>(`/organizations/${orgSlug}/settings/workspace`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getWorkspaceMembersSettings(orgSlug: string): Promise<WorkspaceMember[]> {
    const data = await fetchWithAuth<WorkspaceMember[]>(`/organizations/${orgSlug}/settings/members`);
    return data || [];
  },

  async inviteWorkspaceMember(orgSlug: string, email: string, role: string = 'member'): Promise<WorkspaceMember | null> {
    return await fetchWithAuth<WorkspaceMember>(`/organizations/${orgSlug}/settings/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  async getTeams(orgSlug: string, authToken?: string): Promise<Team[]> {
    const options: RequestInit = authToken
      ? { headers: { Authorization: `Bearer ${authToken}` } }
      : {};
    const data = await fetchWithAuth<Team[]>(`/workspaces/${orgSlug}/teams`, options);
    return data || [];
  },

  async updateTeam(teamId: string, updates: Partial<Team>): Promise<Team | null> {
    return await fetchWithAuth<Team>(`/teams/${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getTeamMembers(teamId: string): Promise<any[]> {
    const data = await fetchWithAuth<any[]>(`/teams/${teamId}/members`);
    return data || [];
  },

  async addTeamMember(teamId: string, userId: string): Promise<any | null> {
    return await fetchWithAuth<any>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    await fetchWithAuth<any>(`/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    });
    return true;
  },

  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    const data = await fetchWithAuth<WorkflowState[]>(`/teams/${teamId}/states`);
    return data || [];
  },

  // Issues
  async getIssues(params?: { teamId?: string; stateId?: string }): Promise<Issue[]> {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('team_id', params.teamId);
    if (params?.stateId) query.append('state_id', params.stateId);

    const qs = query.toString();
    const data = await fetchWithAuth<Issue[]>(`/issues${qs ? `?${qs}` : ''}`);
    return data || [];
  },

  async getInbox(orgSlug: string): Promise<Issue[] | null> {
    return await fetchWithAuth<Issue[]>(`/organizations/${orgSlug}/inbox`);
  },

  async getIssue(idOrKey: string): Promise<Issue | null> {
    return await fetchWithAuth<Issue>(`/issues/${idOrKey}`);
  },

  async createIssue(issue: Partial<Issue>): Promise<Issue | null> {
    const sessionId = getClientSessionId();
    return await fetchWithAuth<Issue>(`/issues`, {
      method: 'POST',
      body: JSON.stringify({ ...issue, client_session_id: sessionId }),
    });
  },

  async updateIssue(id: string, updates: Partial<Issue> & { expected_version?: number }): Promise<Issue | null> {
    const sessionId = getClientSessionId();
    return await fetchWithAuth<Issue>(`/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, client_session_id: sessionId }),
    });
  },

  async reorderIssue(
    id: string,
    state_id?: string,
    prev_position?: string,
    next_position?: string
  ): Promise<Issue | null> {
    const sessionId = getClientSessionId();
    return await fetchWithAuth<Issue>(`/issues/${id}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({
        state_id,
        prev_position,
        next_position,
        client_session_id: sessionId,
      }),
    });
  },

  async createSubtask(
    issueId: string,
    subtask: { title: string; assignee_id?: string; estimate?: number; priority?: string }
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
    approvedTasks: (string | { title: string; description?: string; estimate?: number; priority?: string })[]
  ): Promise<Issue[] | null> {
    const formatted = approvedTasks.map((t) =>
      typeof t === 'string'
        ? { title: t, description: '', estimate: 2, priority: 'medium' }
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
  ): Promise<{ attachment_id: string; issue_id: string; upload_url: string; storage_path: string; file_name: string } | null> {
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
    issue_id: string;
    target_state_id?: string;
    target_assignee_id?: string;
  }): Promise<{ status: string; action: string; issue_id: string; message: string; result?: any } | null> {
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
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
        }
      }
    }
  },
};
