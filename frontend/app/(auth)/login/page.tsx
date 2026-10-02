'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Lock, Mail } from 'lucide-react';

import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
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
      }
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      const token = data?.session?.access_token;
      if (token && typeof window !== 'undefined') {
        localStorage.setItem('supabase_access_token', token);
        document.cookie = `sb-access-token=${token}; path=/; max-age=604800; SameSite=Lax`;
      }

      // Query the user's accessible workspaces
      const myWorkspaces = await api.getMyWorkspaces();

      if (myWorkspaces && myWorkspaces.length > 0) {
        const firstWs = myWorkspaces[0];
        let teamKey = firstWs.teams?.[0]?.key ? firstWs.teams[0].key.toLowerCase() : '';
        if (!teamKey) {
          const orgTeams = await api.getTeams(firstWs.organization.slug);
          teamKey = orgTeams?.[0]?.key ? orgTeams[0].key.toLowerCase() : '';
        }
        window.location.href = teamKey ? `/${firstWs.organization.slug}/${teamKey}/issues` : `/${firstWs.organization.slug}/issues`;
      } else {
        // If user has no workspaces yet, redirect to signup/workspace creation
        window.location.href = '/signup';
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm space-y-6 bg-zinc-950 border border-zinc-800 p-8 rounded-xl shadow-2xl animate-fade-in">
        <div className="space-y-2 text-center">
          <div className="w-10 h-10 rounded-lg bg-white text-black flex items-center justify-center mx-auto shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-white">Sign in to Workspace</h1>
          <p className="text-xs text-zinc-400">High-speed project management for modern teams</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Email</label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Password</label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="text-center text-xs text-zinc-400 space-y-1.5">
          <div>
            <span>Don't have an account? </span>
            <Link href="/signup" className="text-white hover:underline font-medium">
              Sign up
            </Link>
          </div>
          <div>
            <Link href="/accept-invite" className="text-zinc-500 hover:text-zinc-300 transition-colors text-[11px]">
              Invited to a workspace? Set your password
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
