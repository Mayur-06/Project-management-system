'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user arrived via an invite or recovery link in the URL hash/query
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (
        hash.includes('type=invite') ||
        search.includes('type=invite') ||
        hash.includes('type=recovery') ||
        search.includes('type=recovery')
      ) {
        router.replace('/accept-invite' + window.location.search + window.location.hash);
        return;
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
        return;
      }

      if (session.access_token && typeof window !== 'undefined') {
        localStorage.setItem('supabase_access_token', session.access_token);
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=604800; SameSite=Lax`;
      }

      try {
        const workspaces = await api.getMyWorkspaces();
        if (workspaces && workspaces.length > 0) {
          const firstOrg = workspaces[0];
          let teamKey = firstOrg.teams?.[0]?.key ? firstOrg.teams[0].key.toLowerCase() : '';
          if (!teamKey) {
            const orgTeams = await api.getTeams(firstOrg.organization.slug);
            teamKey = orgTeams?.[0]?.key ? orgTeams[0].key.toLowerCase() : '';
          }
          router.replace(teamKey ? `/${firstOrg.organization.slug}/${teamKey}/issues` : `/${firstOrg.organization.slug}/issues`);
        } else {
          router.replace('/signup');
        }
      } catch {
        router.replace('/login');
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}
