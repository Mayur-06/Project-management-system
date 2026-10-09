'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, User, Mail, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { api, establishClientSession } from '@/lib/api';

export default function AcceptInvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check if Supabase already acquired a session from the URL hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setEmail(session.user.email);
        const metaName = session.user.user_metadata?.full_name;
        if (metaName) setName(metaName);
      }
    });

    // 2. Also inspect URL search parameters or hash for email
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get('email');
      if (emailParam) {
        setEmail(emailParam);
      }
    }
  }, []);

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim();
      const cleanName = name.trim();

      // Step A: Update user password via active Supabase session (established via invite link token)
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { full_name: cleanName },
      });
      if (updateError) {
        throw new Error(updateError.message || 'Failed to set password. Invitation link may be expired.');
      }

      // Step C: Sign in via backend signin endpoint to ensure valid fresh session
      try {
        const signinRes = await api.signin(cleanEmail, password);
        await establishClientSession(signinRes.session);
      } catch (signInErr: any) {
        console.warn('Backend signin fallback in accept-invite:', signInErr);
        // Fallback to active session if available
        const currentSession = await supabase.auth.getSession();
        const token = currentSession.data.session?.access_token;
        if (token && typeof window !== 'undefined') {
          localStorage.setItem('supabase_access_token', token);
          document.cookie = `sb-access-token=${token}; path=/; max-age=604800; SameSite=Lax`;
        }
      }

      setSuccessMsg('Password created successfully! Joining your workspace...');

      // Step D: Discover the workspace the user was invited to
      const myWorkspaces = await api.getMyWorkspaces();
      if (myWorkspaces && myWorkspaces.length > 0) {
        const targetWs = myWorkspaces[0];
        const teamKey = targetWs.teams?.[0]?.key ? targetWs.teams[0].key.toLowerCase() : '';
        const targetUrl = teamKey
          ? `/${targetWs.organization.slug}/${teamKey}/issues`
          : `/${targetWs.organization.slug}/issues`;
        
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 800);
      } else {
        setTimeout(() => {
          window.location.href = '/';
        }, 800);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to set password. Please try again.');
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
          <h1 className="text-xl font-bold text-white">Accept Invitation</h1>
          <p className="text-xs text-zinc-400">
            Set your password to join your team workspace
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded text-xs text-red-200">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleAcceptInvite} className="space-y-4" noValidate>
          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Email Address</label>
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
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Your Full Name</label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="Jane Doe"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Create Password</label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Confirm Password</label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{loading ? 'Joining workspace...' : 'Set Password & Enter'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="text-center text-xs text-zinc-400">
          <span>Already know your password? </span>
          <Link href="/login" className="text-white hover:underline font-medium">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
