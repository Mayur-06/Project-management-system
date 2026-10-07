'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Building, Loader2, Check, AlertCircle } from 'lucide-react';
import { Organization } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const { organization, currentUser, workspaceUsers } = useWorkspace();
  
  const [orgName, setOrgName] = useState(organization?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, [organization]);

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const isAdmin = currentMember?.role === 'admin' || currentUser?.id === '00000000-0000-0000-0000-000000000001';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      if (organization?.slug && orgName.trim() !== organization.name) {
        const updatedOrg = await api.updateWorkspaceSettings(organization.slug, { name: orgName.trim() });
        if (updatedOrg) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2500);
        }
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to update workspace settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span>Loading workspace settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <form onSubmit={handleSave} className="space-y-8">
        {/* Organization Details */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Organization Details</h3>
            <span className={`text-sm px-2 py-1 rounded font-medium ${
              isAdmin 
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
            }`}>
              {isAdmin ? 'Admin Edit Access' : 'View Only (Member)'}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="org-name" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Workspace Name
              </label>
              <input
                id="org-name"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!isAdmin}
                required
                className="w-full bg-[#161920] border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                URL Slug
              </label>
              <div className="flex items-center bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3 text-white">
                <span className="text-zinc-400 mr-3">app.linear/</span>
                <span className="font-medium">{organization?.slug || ''}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="h-px bg-zinc-800/80" />

        {/* Company Branding */}
        <section className="space-y-6">
          <h3 className="text-lg font-semibold text-white">Company Branding</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Company Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  {organization?.logo_url ? (
                    <img src={organization.logo_url} alt="Logo" className="w-full h-full rounded object-cover" />
                  ) : (
                    <Building className="w-8 h-8 text-zinc-500" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    disabled={!isAdmin}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Change Logo
                  </button>
                  <button 
                    type="button"
                    disabled={!isAdmin}
                    className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Logo URL
              </label>
              <input
                type="url"
                value={organization?.logo_url || ''}
                onChange={(e) => {}} // Would need API support
                disabled={!isAdmin}
                placeholder="https://example.com/logo.png"
                className="w-full max-w-md bg-[#161920] border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-zinc-500">Enter a direct link to your logo image (SVG, PNG, JPG)</p>
            </div>
          </div>
        </section>

        {/* Save Footer */}
        {isAdmin && (
          <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-end gap-4">
            {saveError && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4" />
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <Check className="w-4 h-4" />
                Settings saved successfully
              </div>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-indigo-500/20"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}