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

    let isMounted = true;

    async function init() {
      // Hard timeout: if init takes longer than 6s total, redirect to login
      const hardTimeoutId = setTimeout(() => {
        if (isMounted) {
          console.warn('Root init timed out — redirecting to /login');
          window.location.replace('/login');
        }
      }, 6000);

      try {
        let token: string | null = null;

        // Try to get token from localStorage first (fastest)
        if (typeof window !== 'undefined') {
          token = localStorage.getItem('supabase_access_token');
        }

        // If not in localStorage, try Supabase session with timeout
        if (!token) {
          try {
            const sessionPromise = supabase.auth.getSession();
            const sessionTimeout = new Promise<any>((resolve) =>
              setTimeout(() => resolve({ data: { session: null } }), 3000)
            );
            const res = await Promise.race([sessionPromise, sessionTimeout]);
            token = res?.data?.session?.access_token || null;
            if (token && typeof window !== 'undefined') {
              localStorage.setItem('supabase_access_token', token);
            }
          } catch {
            token = null;
          }
        }

        if (!token) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('supabase_access_token');
            document.cookie = 'sb-access-token=; path=/; max-age=0';
          }
          if (isMounted) window.location.replace('/login');
          clearTimeout(hardTimeoutId);
          return;
        }

        // Store token in cookie for middleware
        if (typeof window !== 'undefined') {
          document.cookie = `sb-access-token=${token}; path=/; max-age=604800; SameSite=Lax`;
        }

        // Fetch workspaces with timeout
        let workspaces: any[] = [];
        try {
          const wsPromise = api.getMyWorkspaces(token);
          const wsTimeout = new Promise<any[]>((resolve) =>
            setTimeout(() => resolve([]), 4000)
          );
          workspaces = await Promise.race([wsPromise, wsTimeout]) || [];
        } catch (wsErr: any) {
          console.warn('Error loading workspaces on root:', wsErr);
          if (wsErr instanceof Error && wsErr.message === 'Unauthorized') {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('supabase_access_token');
              document.cookie = 'sb-access-token=; path=/; max-age=0';
            }
            if (isMounted) window.location.replace('/login');
            clearTimeout(hardTimeoutId);
            return;
          }
        }

        if (!isMounted) return;

        if (workspaces && workspaces.length > 0) {
          const firstOrg = workspaces[0];
          let teamKey = firstOrg.teams?.[0]?.key ? firstOrg.teams[0].key.toLowerCase() : '';
          if (!teamKey && firstOrg.organization?.slug) {
            try {
              const orgTeams = await api.getTeams(firstOrg.organization.slug, token);
              teamKey = orgTeams?.[0]?.key ? orgTeams[0].key.toLowerCase() : '';
            } catch {}
          }
          const safeTeamKey = teamKey || 'eng';
          const destination = `/${firstOrg.organization.slug}/${safeTeamKey}/issues`;
          clearTimeout(hardTimeoutId);
          window.location.replace(destination);
        } else {
          // Authenticated but no workspace yet
          clearTimeout(hardTimeoutId);
          window.location.replace('/signup');
        }
      } catch (err) {
        console.error('Root init error:', err);
        clearTimeout(hardTimeoutId);
        if (isMounted) window.location.replace('/login');
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center p-4 text-center">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-xs text-zinc-400 font-medium tracking-wide">Connecting to workspace...</p>
      <div className="mt-6 flex items-center gap-4 text-[11px] text-zinc-500">
        <button
          onClick={async () => {
            try {
              await supabase.auth.signOut();
            } catch {}
            if (typeof window !== 'undefined') {
              localStorage.removeItem('supabase_access_token');
              document.cookie = 'sb-access-token=; path=/; max-age=0';
              window.location.href = '/login';
            }
          }}
          className="hover:text-zinc-300 underline cursor-pointer"
        >
          Sign in to another account
        </button>
        <span>•</span>
        <button
          onClick={() => {
            window.location.replace('/signup');
          }}
          className="hover:text-zinc-300 underline cursor-pointer"
        >
          Create workspace
        </button>
      </div>
    </div>
  );
}
