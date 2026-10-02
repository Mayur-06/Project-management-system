'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Lock, Mail, User, Building2, Layers } from 'lucide-react';

import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [teamName, setTeamName] = useState('Engineering');
  const [teamKey, setTeamKey] = useState('ENG');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleWorkspaceNameChange = (val: string) => {
    setWorkspaceName(val);
    if (!slugManuallyEdited) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setWorkspaceSlug(generated);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const cleanSlug = workspaceSlug.trim().toLowerCase();
    const cleanKey = (teamKey.trim() || 'ENG').toUpperCase();
    const cleanTeamName = teamName.trim() || 'Engineering';

    if (!cleanSlug || cleanSlug.length < 2) {
      setErrorMsg('Workspace URL slug must be at least 2 alphanumeric characters.');
      setLoading(false);
      return;
    }

    try {
      // 1. Register user via backend Admin API (auto-confirms email and bypasses Supabase free-tier email rate limits)
      try {
        await api.register(name.trim(), email.trim(), password);
      } catch (backendErr) {
        console.warn('Backend admin signup fallback:', backendErr);
      }

      // 2. Sign in immediately to acquire the real Supabase JWT session
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      let token = signInData?.session?.access_token;

      // If signIn failed, fall back to standard Supabase client signUp
      if (!token) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (authError) {
          setErrorMsg(authError.message);
          setLoading(false);
          return;
        }

        token = authData?.session?.access_token;

        if (!token) {
          const retrySign = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          token = retrySign.data?.session?.access_token;
        }
      }

      if (!token) {
        setErrorMsg('Account registered. Please log in with your credentials.');
        setLoading(false);
        return;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('supabase_access_token', token);
        document.cookie = `sb-access-token=${token}; path=/; max-age=604800; SameSite=Lax`;
      }

      // 3. Check if user already belongs to an invited workspace!
      const existingWorkspaces = await api.getMyWorkspaces();
      if (existingWorkspaces && existingWorkspaces.length > 0) {
        const targetWs = existingWorkspaces[0];
        const teamKey = targetWs.teams?.[0]?.key ? targetWs.teams[0].key.toLowerCase() : '';
        window.location.href = teamKey
          ? `/${targetWs.organization.slug}/${teamKey}/issues`
          : `/${targetWs.organization.slug}/issues`;
        return;
      }

      // 4. If no invited workspace, create the user's custom organization workspace
      const createdOrg = await api.createWorkspace(
        workspaceName.trim() || 'My Workspace',
        cleanSlug
      );

      if (!createdOrg) {
        setErrorMsg('Failed to create workspace. Please check the slug or server logs.');
        setLoading(false);
        return;
      }

      // 4. Create initial default team with workflow states
      const createdTeam = await api.createTeam(createdOrg.slug, {
        name: cleanTeamName,
        key: cleanKey,
        cycle_duration_weeks: 2,
      });

      const finalKey = (createdTeam?.key || cleanKey).toLowerCase();

      // 5. Redirect to the newly created user workspace
      window.location.href = `/${createdOrg.slug}/${finalKey}/issues`;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Something went wrong during account setup');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md space-y-6 bg-zinc-950 border border-zinc-800 p-8 rounded-xl shadow-2xl animate-fade-in">
        <div className="space-y-2 text-center">
          <div className="w-10 h-10 rounded-lg bg-white text-black flex items-center justify-center mx-auto shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-white">Create your workspace</h1>
          <p className="text-xs text-zinc-400">Set up your account and project management hub</p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded text-xs text-red-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Full Name</label>
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
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Work Email</label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                  placeholder="jane@company.com"
                  required
                />
              </div>
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
                minLength={6}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/80">
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Workspace Name</label>
            <div className="relative flex items-center">
              <Building2 className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="My Organization"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">
              Workspace URL Slug
            </label>
            <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 overflow-hidden focus-within:border-white">
              <span className="text-[11px] font-mono text-zinc-500 pl-3 select-none">app/</span>
              <input
                type="text"
                value={workspaceSlug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                }}
                className="w-full bg-transparent text-xs text-white px-2 py-2.5 focus:outline-none font-mono"
                placeholder="my-org"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Initial Team</label>
              <div className="relative flex items-center">
                <Layers className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                  placeholder="Engineering"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Team Identifier</label>
              <input
                type="text"
                value={teamKey}
                onChange={(e) => setTeamKey(e.target.value.toUpperCase().slice(0, 5))}
                className="w-full bg-zinc-900 text-xs text-white px-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none font-mono"
                placeholder="ENG"
                required
                maxLength={5}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'Setting up workspace...' : 'Create Workspace'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="text-center text-xs text-zinc-400">
          <span>Already have an account? </span>
          <Link href="/login" className="text-white hover:underline font-medium">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

