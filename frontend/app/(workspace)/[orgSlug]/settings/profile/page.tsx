'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Loader2, 
  User, 
  Mail, 
  Shield, 
  Keyboard, 
  LogOut,
  Sparkles,
  Check,
  AlertCircle
} from 'lucide-react';
import { User as UserType } from '@/types';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function ProfileSettingsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const { currentUser, workspaceUsers, organization } = useWorkspace();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(false);
  }, [currentUser]);

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const currentUserRole = currentMember?.role || (currentUser?.id === '00000000-0000-0000-0000-000000000001' ? 'admin' : 'member');
  const isAdmin = currentUserRole === 'admin';

  const getInitials = (name: string | undefined, email: string | undefined) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.[0]?.toUpperCase() || 'U';
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('supabase_access_token');
      document.cookie = 'sb-access-token=; path=/; max-age=0; SameSite=Lax';
      await supabase.auth.signOut();
    } catch {
      // Ignore
    } finally {
      window.location.href = '/login';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile Card */}
      <section className="space-y-4">
        <div className="p-6 bg-[#14171e]/70 border border-zinc-800 rounded-xl flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white shadow-md">
            {getInitials(currentUser?.name, currentUser?.email)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{currentUser?.name || 'Workspace Member'}</h3>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                isAdmin 
                  ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400' 
                  : 'bg-zinc-800 border border-zinc-700/50 text-zinc-300'
              }`}>
                {currentUserRole.charAt(0).toUpperCase() + currentUserRole.slice(1)}
              </span>
            </div>
            <p className="text-sm text-zinc-400">{currentUser?.email || 'user@workspace.com'}</p>
            <p className="text-xs text-zinc-500 mt-1">Signed in with Supabase Authentication</p>
          </div>
        </div>

        {/* Account Info */}
        <div className="p-4 bg-[#14171e]/70 border border-zinc-800 rounded-xl space-y-3">
          <h4 className="text-sm font-semibold text-zinc-300">Account Information</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-zinc-400">Email</p>
              <p className="text-white">{currentUser?.email || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Workspace Role</p>
              <p className="text-white capitalize">{currentUserRole}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Workspace</p>
              <p className="text-white">{organization?.name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Authentication</p>
              <p className="text-white">Supabase Auth</p>
            </div>
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Keyboard className="w-5 h-5 text-indigo-400" />
          Essential Keyboard Shortcuts
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { action: 'Command Palette', shortcut: '⌘K' },
            { action: 'Settings Dialog', shortcut: '⌘,' },
            { action: 'Create New Issue', shortcut: 'C' },
            { action: 'Dismiss / Close Modal', shortcut: 'ESC' },
            { action: 'AI Assistant', shortcut: '⌘J' },
            { action: 'Quick Switcher', shortcut: '⌘⇧K' },
          ].map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-[#14161d] border border-zinc-800/80 rounded-lg">
              <span className="text-sm text-zinc-300">{item.action}</span>
              <kbd className="px-2 py-1 rounded bg-zinc-800 text-zinc-400 font-mono text-xs">
                {item.shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </section>

      {/* Theme & Appearance */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          Theme & Appearance
        </h3>
        <div className="p-4 bg-[#14171e]/70 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-white">High-Contrast Dark</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
              Default
            </span>
          </div>
          <p className="text-xs text-zinc-500">Linear's signature high-contrast dark theme. Additional themes coming soon.</p>
        </div>
      </section>

      {/* Session & Security */}
      <section className="space-y-4 pt-4 border-t border-zinc-800/80">
        <h3 className="text-lg font-semibold text-white">Session & Security</h3>
        <div className="p-4 bg-[#14171e]/70 border border-zinc-800 rounded-xl">
          <p className="text-sm text-zinc-300 mb-4">Manage your active sessions and security settings</p>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out of All Sessions
          </button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-4 pt-4 border-t border-zinc-800/80">
        <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
        <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-300 mb-3">
            Irreversible actions. Please proceed with caution.
          </p>
          <button
            className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium transition-colors"
            disabled
          >
            Delete Account
          </button>
        </div>
      </section>
    </div>
  );
}