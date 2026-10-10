'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { toast } from 'sonner';
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton';

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const { organization, currentUser, workspaceUsers } = useWorkspace();
  
  const [orgName, setOrgName] = useState(organization?.name || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (organization?.name) {
      setOrgName(organization.name);
    }
  }, [organization?.name]);

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const isAdmin = currentMember?.role === 'admin' || currentUser?.id === '00000000-0000-0000-0000-000000000001';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.slug || !orgName.trim() || isSaving) return;

    setIsSaving(true);

    try {
      const updatedOrg = await api.updateWorkspace(organization.slug, { name: orgName.trim() });
      if (updatedOrg) {
        toast.success('Workspace settings updated successfully');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update workspace settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!organization) {
    return <SettingsSkeleton variant="form" />;
  }

  return (
    <div className="max-w-3xl space-y-8 font-sans">
      <div className="pb-4 border-b border-[#1e2025]">
        <h2 className="text-xl font-bold text-white">Workspace Settings</h2>
        <p className="text-xs text-zinc-400 mt-1">
          Manage your organization name and URL identifier.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Organization Details */}
        <div className="p-6 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e2025]">
            <h3 className="text-sm font-semibold text-white">Organization Details</h3>
            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
              isAdmin 
                ? 'bg-zinc-900 text-white border border-zinc-700' 
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
            }`}>
              {isAdmin ? 'Admin Edit Access' : 'View Only (Member)'}
            </span>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="org-name" className="block text-xs font-medium text-zinc-300">
                Workspace Name
              </label>
              <input
                id="org-name"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!isAdmin}
                required
                className="w-full max-w-md bg-black/60 border border-[#1e2025] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#5e6ad2] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Workspace Slug (URL Prefix)
              </label>
              <div className="flex items-center bg-black/60 border border-[#1e2025] rounded-lg px-3 py-2 text-xs text-zinc-300 max-w-md">
                <span className="text-zinc-500 select-none">app/</span>
                <span className="font-mono font-medium text-white ml-1">{organization?.slug || orgSlug}</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Slugs are unique permanent identifiers for your workspace routing.
              </p>
            </div>
          </div>
        </div>

        {/* Save Footer */}
        {isAdmin && (
          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving || !orgName.trim() || orgName.trim() === organization?.name}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5e6ad2] hover:bg-[#7170ff] text-xs font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}