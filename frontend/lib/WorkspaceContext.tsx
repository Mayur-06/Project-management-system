'use client';

import React, { createContext, useContext } from 'react';
import { Organization, Team, User, WorkspaceMember } from '@/types';

export interface WorkspaceContextValue {
  organization: Organization | null;
  teams: Team[];
  /** Active team matching the current [teamKey] URL segment */
  currentTeam: Team | null;
  workspaceUsers: WorkspaceMember[];
  currentUser: User | null;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  organization: null,
  teams: [],
  currentTeam: null,
  workspaceUsers: [],
  currentUser: null,
});

/** Consume workspace data without prop-drilling or redundant API calls. */
export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
