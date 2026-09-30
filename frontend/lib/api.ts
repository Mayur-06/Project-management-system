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
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
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

  async getTeams(orgSlug: string): Promise<Team[]> {
    const data = await fetchWithAuth<Team[]>(`/workspaces/${orgSlug}/teams`);
    return data || [];
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
    return await fetchWithAuth<Issue>(`/issues`, {
      method: 'POST',
      body: JSON.stringify(issue),
    });
  },

  async updateIssue(id: string, updates: Partial<Issue> & { expected_version?: number }): Promise<Issue | null> {
    return await fetchWithAuth<Issue>(`/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async reorderIssue(id: string, state_id: string, sort_order: string): Promise<void> {
    await fetchWithAuth(`/issues/${id}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ state_id, sort_order }),
    });
  },

  // Comments
  async getComments(issueId: string): Promise<IssueComment[]> {
    const data = await fetchWithAuth<IssueComment[]>(`/issues/${issueId}/comments`);
    return data || [];
  },

  async addComment(issueId: string, bodyText: string): Promise<IssueComment | null> {
    return await fetchWithAuth<IssueComment>(`/issues/${issueId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body_text: bodyText }),
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
  async checkDuplicates(title: string): Promise<{ duplicates: { id: string; title: string; similarity: number }[] }> {
    const data = await fetchWithAuth<{ duplicates: { id: string; title: string; similarity: number }[] }>(
      `/ai/duplicates/check`,
      {
        method: 'POST',
        body: JSON.stringify({ title }),
      }
    );
    return data || { duplicates: [] };
  },

  // AI Auto-Triage
  async autoTriage(title: string, description: string): Promise<TriageOutput | null> {
    return await fetchWithAuth<TriageOutput>(`/ai/triage/classify`, {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    });
  },

  // AI Sub-task Breakdown
  async startBreakdown(issueId: string, threadId?: string): Promise<{ thread_id: string; proposed_tasks: string[] } | null> {
    return await fetchWithAuth(`/ai/breakdown/start`, {
      method: 'POST',
      body: JSON.stringify({ issue_id: issueId, thread_id: threadId }),
    });
  },

  async resumeBreakdown(threadId: string, approvedTasks: string[]): Promise<Issue[] | null> {
    return await fetchWithAuth(`/ai/breakdown/resume`, {
      method: 'POST',
      body: JSON.stringify({ thread_id: threadId, approved_tasks: approvedTasks }),
    });
  },
};
