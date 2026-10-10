'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Keyboard, 
  Check, 
  Loader2,
  Pencil,
  Briefcase
} from 'lucide-react';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { toast } from 'sonner';
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton';

export default function ProfileSettingsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const { currentUser, workspaceUsers, organization } = useWorkspace();

  const [name, setName] = useState(currentUser?.name || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [jobDescription, setJobDescription] = useState(currentUser?.job_description || '');

  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingJobDesc, setIsSavingJobDesc] = useState(false);

  useEffect(() => {
    if (currentUser?.name) {
      setName(currentUser.name);
    }
    if (currentUser?.job_description !== undefined) {
      setJobDescription(currentUser.job_description);
    }
  }, [currentUser]);

  if (!currentUser) {
    return <SettingsSkeleton variant="form" />;
  }

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const currentUserRole = currentMember?.role || (currentUser?.id === '00000000-0000-0000-0000-000000000001' ? 'admin' : 'member');
  const isAdmin = currentUserRole === 'admin';

  const getInitials = (userName: string | undefined, userEmail: string | undefined) => {
    if (userName) {
      return userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return userEmail?.[0]?.toUpperCase() || 'U';
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || isSavingName) return;
    if (trimmed === currentUser?.name) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);

    try {
      const ok = await api.updateCurrentUserProfile(trimmed, undefined);
      if (ok) {
        setIsEditingName(false);
        if (currentUser) {
          currentUser.name = trimmed;
        }
        toast.success('Display name updated');
      } else {
        toast.error('Failed to update name');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error updating name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveJobDescription = async () => {
    if (isSavingJobDesc) return;
    setIsSavingJobDesc(true);

    try {
      const ok = await api.updateCurrentUserProfile(undefined, jobDescription.trim());
      if (ok) {
        if (currentUser) {
          currentUser.job_description = jobDescription.trim();
        }
        toast.success('Job description updated');
      } else {
        toast.error('Failed to update job description');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error updating job description');
    } finally {
      setIsSavingJobDesc(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 font-sans">
      <div className="pb-4 border-b border-[#1e2025]">
        <h2 className="text-xl font-bold text-white">Profile Settings</h2>
        <p className="text-xs text-zinc-400 mt-1">
          Manage your personal identity, role details, and preferences.
        </p>
      </div>

      {/* User Card with Inline Editable Name */}
      <div className="p-6 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#1e2025] border border-white/10 flex items-center justify-center text-base font-semibold text-white shadow-sm shrink-0">
            {getInitials(name || currentUser?.name, currentUser?.email)}
          </div>

          <div className="flex-1 space-y-2">
            {/* Inline Name Editing */}
            <div className="flex items-center gap-3">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') {
                        setName(currentUser?.name || '');
                        setIsEditingName(false);
                      }
                    }}
                    autoFocus
                    className="bg-black/60 border border-[#5e6ad2] rounded-lg px-2.5 py-1 text-xs text-white font-semibold focus:outline-none"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    className="p-1.5 rounded-lg bg-[#5e6ad2] hover:bg-[#7170ff] text-white transition-colors cursor-pointer"
                    title="Save name"
                  >
                    {isSavingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setName(currentUser?.name || '');
                      setIsEditingName(false);
                    }}
                    className="px-2 py-1 text-xs text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h3 className="text-base font-semibold text-white">
                    {name || currentUser?.name || 'Workspace User'}
                  </h3>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 text-zinc-500 hover:text-white hover:bg-white/[0.06] rounded transition-colors cursor-pointer"
                    title="Edit name inline"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                isAdmin 
                  ? 'bg-zinc-900 border border-zinc-700 text-white' 
                  : 'bg-zinc-900 border border-[#1e2025] text-zinc-400'
              }`}>
                {currentUserRole.charAt(0).toUpperCase() + currentUserRole.slice(1)}
              </span>
            </div>

            <p className="text-xs text-zinc-400 font-mono">{currentUser?.email || 'user@workspace.com'}</p>
          </div>
        </div>

        {/* Optional Job Description */}
        <div className="pt-4 border-t border-[#1e2025] space-y-2">
          <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
            <span>Job Description / Title</span>
            <span className="text-[10px] text-zinc-500 font-normal">(optional)</span>
          </label>

          <div className="flex items-start gap-2 max-w-xl">
            <input
              type="text"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer, Product Designer, Founder"
              className="flex-1 bg-black/60 border border-[#1e2025] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#5e6ad2] transition-colors"
            />
            <button
              onClick={handleSaveJobDescription}
              disabled={isSavingJobDesc || jobDescription === (currentUser?.job_description || '')}
              className="px-3.5 py-2 rounded-lg bg-[#5e6ad2] hover:bg-[#7170ff] text-xs font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              {isSavingJobDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Tell teammates your focus area or role within this workspace. You can update this at any time.
          </p>
        </div>
      </div>

      {/* Account Info */}
      <div className="p-6 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-4">
        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Account Overview</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-zinc-500">Email</p>
            <p className="text-zinc-200 font-medium font-mono truncate mt-0.5">{currentUser?.email || 'Not set'}</p>
          </div>
          <div>
            <p className="text-zinc-500">Workspace Role</p>
            <p className="text-zinc-200 font-medium capitalize mt-0.5">{currentUserRole}</p>
          </div>
          <div>
            <p className="text-zinc-500">Organization</p>
            <p className="text-zinc-200 font-medium truncate mt-0.5">{organization?.name || orgSlug.toUpperCase()}</p>
          </div>
          <div>
            <p className="text-zinc-500">Authentication</p>
            <p className="text-zinc-200 font-medium mt-0.5">Supabase Auth</p>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Reference */}
      <div className="p-6 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-[#7170ff]" />
          <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Keyboard Shortcuts</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            { action: 'Command Palette', shortcut: '⌘K' },
            { action: 'Settings Page', shortcut: '⌘,' },
            { action: 'Create New Issue', shortcut: 'C' },
            { action: 'Dismiss / Return to Workspace', shortcut: 'ESC' },
            { action: 'AI Assistant', shortcut: '⌘J' },
          ].map((item, index) => (
            <div key={index} className="flex items-center justify-between p-2.5 bg-black/60 border border-[#1e2025] rounded-lg">
              <span className="text-zinc-300">{item.action}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 font-mono text-[11px] border border-zinc-800">
                {item.shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}