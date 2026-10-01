import {
  Issue,
  WorkflowState,
  Cycle,
  Project,
  IssueComment,
  ActivityLog,
  TriageOutput,
  Team,
  Organization,
  WorkspaceMember,
  IssueAttachment,
} from '@/types';
import { getClientSessionId } from '@/lib/supabase/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const DEV_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJlbWFpbCI6ImFsZXhAYWNtZS5pbmMiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQifQ.dev_sig';

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  let token = typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
  if (!token) {
    token = DEV_TOKEN;
    if (typeof window !== 'undefined') {
      localStorage.setItem('supabase_access_token', DEV_TOKEN);
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  // Workspaces & Teams
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

  async getTeams(orgSlug: string): Promise<Team[]> {
    const data = await fetchWithAuth<Team[]>(`/workspaces/${orgSlug}/teams`);
    return data || [];
  },

  async updateTeam(teamId: string, updates: Partial<Team>): Promise<Team | null> {
    return await fetchWithAuth<Team>(`/teams/${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    const data = await fetchWithAuth<WorkflowState[]>(`/teams/${teamId}/states`);
    return data || [];
  },

  // Issues
  async getIssues(params?: { teamId?: string; stateId?: string; cycleId?: string }): Promise<Issue[]> {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('team_id', params.teamId);
    if (params?.stateId) query.append('state_id', params.stateId);
    if (params?.cycleId) query.append('cycle_id', params.cycleId);

    const qs = query.toString();
    const data = await fetchWithAuth<Issue[]>(`/issues${qs ? `?${qs}` : ''}`);
    return data || [];
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

  async reorderIssue(id: string, state_id: string, sort_order: string): Promise<void> {
    const sessionId = getClientSessionId();
    await fetchWithAuth(`/issues/${id}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ state_id, sort_order, client_session_id: sessionId }),
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

  // Cycles
  async getCycles(teamId: string): Promise<Cycle[]> {
    const data = await fetchWithAuth<Cycle[]>(`/teams/${teamId}/cycles`);
    return data || [];
  },

  // Projects
  async getProjects(orgSlug: string): Promise<Project[]> {
    const data = await fetchWithAuth<Project[]>(`/organizations/${orgSlug}/projects`);
    return data || [];
  },

  // AI Duplicates Check
  async checkDuplicates(
    title: string,
    organizationId?: string
  ): Promise<{ duplicates: { id: string; title: string; similarity: number }[] }> {
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
        title: m.title,
        similarity: m.similarity,
      })),
    };
  },

  // AI Auto-Triage
  async autoTriage(title: string, description: string): Promise<TriageOutput | null> {
    return await fetchWithAuth<TriageOutput>(`/ai/triage/classify`, {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    });
  },

  // AI Sub-task Breakdown
  async startBreakdown(
    issueId: string,
    threadId?: string
  ): Promise<{ thread_id: string; proposed_subtasks?: any[]; proposed_tasks?: string[] } | null> {
    const res = await fetchWithAuth<any>(`/ai/breakdown/start`, {
      method: 'POST',
      body: JSON.stringify({ issue_id: issueId, thread_id: threadId }),
    });
    if (!res) return null;
    const proposed = res.proposed_subtasks || res.proposed_tasks || [];
    return {
      thread_id: res.thread_id,
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
};
