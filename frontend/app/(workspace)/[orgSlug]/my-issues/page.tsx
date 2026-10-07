'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function WorkspaceMyIssuesRedirect() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const { teams } = useWorkspace();

  useEffect(() => {
    if (orgSlug && teams.length > 0) {
      const defaultTeamKey = teams[0].key.toLowerCase();
      router.replace(`/${orgSlug}/${defaultTeamKey}/my-issues`);
    }
  }, [orgSlug, teams, router]);

  return (
    <div className="flex items-center justify-center h-screen text-xs text-zinc-500">
      Loading your issues...
    </div>
  );
}
