'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Lock, Mail, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

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

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters long.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        let msg = error.message;
        if (msg.toLowerCase().includes('invalid login credentials')) {
          msg = 'Invalid email or password. Please verify your credentials and try again.';
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'Your email is not verified yet. Please check your inbox or accept your team invitation.';
        }
        setErrorMsg(msg);
        setLoading(false);
        return;
      }

      const token = data?.session?.access_token;
      if (token && typeof window !== 'undefined') {
        localStorage.setItem('supabase_access_token', token);
        document.cookie = `sb-access-token=${token}; path=/; max-age=604800; SameSite=Lax`;
      }

      // Query the user's accessible workspaces
      let myWorkspaces: any[] = [];
      try {
        myWorkspaces = await api.getMyWorkspaces();
      } catch (wsErr: any) {
        console.warn('Error fetching workspaces after login:', wsErr);
      }

      if (myWorkspaces && myWorkspaces.length > 0) {
        const firstWs = myWorkspaces[0];
        let teamKey = firstWs.teams?.[0]?.key ? firstWs.teams[0].key.toLowerCase() : '';
        if (!teamKey && firstWs.organization?.slug) {
          try {
            const orgTeams = await api.getTeams(firstWs.organization.slug);
            teamKey = orgTeams?.[0]?.key ? orgTeams[0].key.toLowerCase() : '';
          } catch {}
        }
        window.location.href = teamKey ? `/${firstWs.organization.slug}/${teamKey}/issues` : `/${firstWs.organization.slug}/issues`;
      } else {
        // If user has no workspaces yet, redirect to signup/workspace creation
        window.location.href = '/signup';
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Login failed. Please check your network and try again.');
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

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Email</label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  if (errorMsg) setErrorMsg(null);
                }}
                className={`w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border transition-colors focus:outline-none ${
                  fieldErrors.email
                    ? 'border-red-500/80 focus:border-red-400 ring-1 ring-red-500/20'
                    : 'border-zinc-800 focus:border-white'
                }`}
                placeholder="name@company.com"
                required
              />
            </div>
            {fieldErrors.email && (
              <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-300 font-medium">Password</label>
            </div>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  if (errorMsg) setErrorMsg(null);
                }}
                className={`w-full bg-zinc-900 text-xs text-white pl-9 pr-10 py-2.5 rounded border transition-colors focus:outline-none ${
                  fieldErrors.password
                    ? 'border-red-500/80 focus:border-red-400 ring-1 ring-red-500/20'
                    : 'border-zinc-800 focus:border-white'
                }`}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-zinc-500 hover:text-zinc-300 p-1 focus:outline-none transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
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
