'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Lock, Mail, User, Building2, Layers, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  teamName?: string;
  teamKey?: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamKey, setTeamKey] = useState('');
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleTeamNameChange = (val: string) => {
    setTeamName(val);
    if (fieldErrors.teamName) setFieldErrors((prev) => ({ ...prev, teamName: undefined }));
    if (!keyManuallyEdited) {
      const clean = val.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (clean.length > 0) {
        setTeamKey(clean.slice(0, 4));
        if (fieldErrors.teamKey) setFieldErrors((prev) => ({ ...prev, teamKey: undefined }));
      } else {
        setTeamKey('');
      }
    }
  };

  const handleWorkspaceNameChange = (val: string) => {
    setWorkspaceName(val);
    if (fieldErrors.workspaceName) {
      setFieldErrors((prev) => ({ ...prev, workspaceName: undefined }));
    }
    if (!slugManuallyEdited) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setWorkspaceSlug(generated);
      if (fieldErrors.workspaceSlug) {
        setFieldErrors((prev) => ({ ...prev, workspaceSlug: undefined }));
      }
    }
  };

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const teamKeyRegex = /^[A-Z0-9]{2,5}$/;

    if (!name.trim()) {
      errors.name = 'Full name is required.';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (!workspaceName.trim()) {
      errors.workspaceName = 'Workspace name is required.';
    }

    const cleanSlug = workspaceSlug.trim().toLowerCase();
    if (!cleanSlug) {
      errors.workspaceSlug = 'Workspace URL slug is required.';
    } else if (cleanSlug.length < 2) {
      errors.workspaceSlug = 'Slug must be at least 2 characters long.';
    } else if (!slugRegex.test(cleanSlug)) {
      errors.workspaceSlug = 'Slug can only contain lowercase letters, numbers, and hyphens.';
    }

    if (!teamName.trim()) {
      errors.teamName = 'Team name is required.';
    }

    const cleanKey = teamKey.trim().toUpperCase();
    if (!cleanKey) {
      errors.teamKey = 'Team identifier is required.';
    } else if (cleanKey.length < 2 || cleanKey.length > 5) {
      errors.teamKey = 'Team key must be between 2 and 5 characters.';
    } else if (!teamKeyRegex.test(cleanKey)) {
      errors.teamKey = 'Must be 2-5 alphanumeric characters (A-Z, 0-9).';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!validate()) {
      return;
    }

    setLoading(true);

    const cleanSlug = workspaceSlug.trim().toLowerCase();
    const cleanKey = (teamKey.trim() || 'ENG').toUpperCase();
    const cleanTeamName = teamName.trim() || 'Engineering';

    try {
      // 1. Register user via backend Admin API (auto-confirms email and bypasses Supabase free-tier email rate limits)
      try {
        await api.register(name.trim(), email.trim(), password);
      } catch (backendErr: any) {
        console.warn('Backend admin signup fallback:', backendErr);
        if (backendErr?.message && !backendErr.message.toLowerCase().includes('already registered')) {
          setErrorMsg(backendErr.message);
          setLoading(false);
          return;
        }
      }

      // 2. Sign in immediately to acquire the real Supabase JWT session
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      let token = signInData?.session?.access_token;

      // If signIn failed, fall back to standard Supabase client signUp
      if (!token) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (authError) {
          let msg = authError.message;
          if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
            msg = 'An account with this email already exists. Please log in instead.';
          }
          setErrorMsg(msg);
          setLoading(false);
          return;
        }

        token = authData?.session?.access_token;

        if (!token) {
          const retrySign = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });
          token = retrySign.data?.session?.access_token;
        }
      }

      if (!token) {
        setErrorMsg('Account registered! Please log in with your credentials to continue.');
        setLoading(false);
        return;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('supabase_access_token', token);
        document.cookie = `sb-access-token=${token}; path=/; max-age=604800; SameSite=Lax`;
      }

      // 3. Check if user already belongs to an invited workspace!
      let existingWorkspaces: any[] = [];
      try {
        existingWorkspaces = await api.getMyWorkspaces();
      } catch (wsErr) {
        console.warn('Failed to query workspaces:', wsErr);
      }

      if (existingWorkspaces && existingWorkspaces.length > 0) {
        const targetWs = existingWorkspaces[0];
        const teamKey = targetWs.teams?.[0]?.key ? targetWs.teams[0].key.toLowerCase() : '';
        window.location.href = teamKey
          ? `/${targetWs.organization.slug}/${teamKey}/issues`
          : `/${targetWs.organization.slug}/issues`;
        return;
      }

      // 4. If no invited workspace, create the user's custom organization workspace
      let createdOrg: any = null;
      try {
        createdOrg = await api.createWorkspace(
          workspaceName.trim() || 'My Workspace',
          cleanSlug
        );
      } catch (orgErr: any) {
        const message = orgErr?.message || 'Failed to create workspace.';
        if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('already exists') || message.toLowerCase().includes('slug')) {
          setErrorMsg('The workspace URL slug is already taken. Please choose another one.');
          setFieldErrors((prev) => ({ ...prev, workspaceSlug: 'This URL slug is already taken.' }));
        } else {
          setErrorMsg(message);
        }
        setLoading(false);
        return;
      }

      if (!createdOrg) {
        setErrorMsg('Failed to create workspace. The slug may already be taken or invalid.');
        setLoading(false);
        return;
      }

      // 5. Create initial default team with workflow states
      let createdTeam: any = null;
      try {
        createdTeam = await api.createTeam(createdOrg.slug, {
          name: cleanTeamName,
          key: cleanKey,
        });
      } catch (teamErr: any) {
        console.warn('Team creation error:', teamErr);
      }

      const finalKey = (createdTeam?.key || cleanKey).toLowerCase();

      // 6. Redirect to the newly created user workspace
      window.location.href = `/${createdOrg.slug}/${finalKey}/issues`;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Something went wrong during account setup. Please try again.');
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
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Full Name</label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className={`w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border transition-colors focus:outline-none ${
                    fieldErrors.name
                      ? 'border-red-500/80 focus:border-red-400 ring-1 ring-red-500/20'
                      : 'border-zinc-800 focus:border-white'
                  }`}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              {fieldErrors.name && (
                <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Work Email</label>
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
                  placeholder="jane@company.com"
                  required
                />
              </div>
              {fieldErrors.email && (
                <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.email}</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Password</label>
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
                minLength={6}
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

          <div className="pt-2 border-t border-zinc-800/80">
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Workspace Name</label>
            <div className="relative flex items-center">
              <Building2 className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                className={`w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border transition-colors focus:outline-none ${
                  fieldErrors.workspaceName
                    ? 'border-red-500/80 focus:border-red-400 ring-1 ring-red-500/20'
                    : 'border-zinc-800 focus:border-white'
                }`}
                placeholder="My Organization"
                required
              />
            </div>
            {fieldErrors.workspaceName && (
              <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.workspaceName}</p>
            )}
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">
              Workspace URL Slug
            </label>
            <div className={`flex items-center rounded border transition-colors bg-zinc-900 overflow-hidden ${
              fieldErrors.workspaceSlug
                ? 'border-red-500/80 ring-1 ring-red-500/20'
                : 'border-zinc-800 focus-within:border-white'
            }`}>
              <span className="text-[11px] font-mono text-zinc-500 pl-3 select-none">app/</span>
              <input
                type="text"
                value={workspaceSlug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  if (fieldErrors.workspaceSlug) {
                    setFieldErrors((prev) => ({ ...prev, workspaceSlug: undefined }));
                  }
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full bg-transparent text-xs text-white px-2 py-2.5 focus:outline-none font-mono"
                placeholder="my-org"
                required
              />
            </div>
            {fieldErrors.workspaceSlug && (
              <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.workspaceSlug}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Initial Team</label>
              <div className="relative flex items-center">
                <Layers className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => handleTeamNameChange(e.target.value)}
                  className={`w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border transition-colors focus:outline-none ${
                    fieldErrors.teamName
                      ? 'border-red-500/80 focus:border-red-400 ring-1 ring-red-500/20'
                      : 'border-zinc-800 focus:border-white'
                  }`}
                  placeholder="e.g. Engineering"
                  required
                />
              </div>
              {fieldErrors.teamName && (
                <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.teamName}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1.5">Team Identifier</label>
              <input
                type="text"
                value={teamKey}
                onChange={(e) => {
                  setKeyManuallyEdited(true);
                  setTeamKey(e.target.value.toUpperCase().slice(0, 5));
                  if (fieldErrors.teamKey) setFieldErrors((prev) => ({ ...prev, teamKey: undefined }));
                }}
                className={`w-full bg-zinc-900 text-xs text-white px-3 py-2.5 rounded border transition-colors focus:outline-none font-mono ${
                  fieldErrors.teamKey
                    ? 'border-red-500/80 focus:border-red-400 ring-1 ring-red-500/20'
                    : 'border-zinc-800 focus:border-white'
                }`}
                placeholder="e.g. ENG"
                required
                maxLength={5}
              />
              {fieldErrors.teamKey && (
                <p className="text-[11px] text-red-400 mt-1 font-medium">{fieldErrors.teamKey}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Setting up workspace...</span>
              </>
            ) : (
              <>
                <span>Create Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
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

