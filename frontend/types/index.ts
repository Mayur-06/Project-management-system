export type MemberRole = 'admin' | 'member' | 'guest';

export type StateCategory = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';

export type IssuePriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export type IssueRelationType = 'blocks' | 'blocked_by' | 'relates_to' | 'duplicate_of';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  job_description?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  status?: 'active' | 'invited' | 'pending';
  user?: User;
  created_at: string;
}

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  issue_counter: number;
  created_at: string;
}

export interface WorkflowState {
  id: string;
  team_id: string;
  name: string;
  color: string;
  category: StateCategory;
  position: string;
  is_default: boolean;
  created_at: string;
}

export interface Label {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  description?: string;
  created_at: string;
}

export interface Issue {
  id: string;
  organization_id: string;
  team_id: string;
  number: number;
  identifier: string; // e.g. "ENG-104"
  title: string;
  description_json?: any;
  description_text?: string;
  priority: IssuePriority;
  estimate?: number;
  state_id: string;
  state?: WorkflowState;
  assignee_id?: string;
  assignee?: User;
  assigned_by_id?: string;
  assigned_by?: User;
  creator_id: string;
  creator?: User;
  project_id?: string;
  parent_id?: string;
  parent?: Issue;
  subtasks?: Issue[];
  labels?: Label[];
  sort_order: string;
  version: number;
  due_date?: string;
  completed_at?: string;
  canceled_at?: string;
  last_modified_by_session?: string;
  source_team_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface IssueComment {
  id: string;
  issue_id: string;
  user_id: string;
  user?: User;
  body_text: string;
  body_json?: any;
  reactions?: { emoji: string; count: number; users: string[] }[];
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  organization_id: string;
  issue_id?: string;
  actor_id: string;
  actor?: User;
  action: string;
  changes?: Record<string, { old?: any; new?: any }>;
  created_at: string;
}

export interface IssueAttachment {
  id: string;
  issue_id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  file_url?: string;
  created_at: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  key: string;
  organization_id: string;
}

export interface UserWorkspaceItem {
  organization: Organization;
  role: MemberRole;
  teams: TeamSummary[];
}

export interface UserWorkspacesResponse {
  workspaces: UserWorkspaceItem[];
}

export interface InboxItem {
  id: string;
  action: string;
  changes?: Record<string, any>;
  actor?: User;
  issue_id?: string;
  issue_identifier?: string;
  issue_title?: string;
  team_key?: string;
  is_deleted: boolean;
  state?: WorkflowState;
  priority?: IssuePriority;
  created_at: string;
}
