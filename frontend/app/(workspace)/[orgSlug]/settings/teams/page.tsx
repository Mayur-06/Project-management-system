'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Users, Plus, ArrowRight, Settings as SettingsIcon } from 'lucide-react';
import { useWorkspace } from '@/lib/WorkspaceContext';

export default function TeamsOverviewSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const { teams, currentUser, workspaceUsers } = useWorkspace();

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const isAdmin = currentMember?.role === 'admin' || currentUser?.id === '00000000-0000-0000-0000-000000000001';

  return (
    <div className="space-y-6 max-w-4xl font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-[#1e2025]">
        <div>
          <h2 className="text-xl font-bold text-white">Teams</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Manage your workspace teams, issue key prefixes, and workflow configuration.
          </p>
        </div>

        {isAdmin && (
          <Link
            href={`/${orgSlug}/teams/new`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#5e6ad2] hover:bg-[#7170ff] transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Team</span>
          </Link>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="p-8 border border-dashed border-[#1e2025] rounded-xl text-center space-y-3">
          <p className="text-xs text-zinc-400">No teams found in this workspace.</p>
          {isAdmin && (
            <Link
              href={`/${orgSlug}/teams/new`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#5e6ad2] hover:bg-[#7170ff] transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Your First Team</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="divide-y divide-[#1e2025] border border-[#1e2025] rounded-xl overflow-hidden bg-[#0f1011]">
          {teams.map((t) => (
            <div
              key={t.id}
              className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-black border border-[#1e2025] flex items-center justify-center font-bold text-xs text-white">
                  {t.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{t.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-[#1e2025]">
                      {t.key}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Issues prefixed with <span className="font-mono text-zinc-400">{t.key}-*</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/${orgSlug}/${t.key.toLowerCase()}/issues`}
                  className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white rounded hover:bg-zinc-900 transition-colors"
                >
                  View Issues
                </Link>
                <Link
                  href={`/${orgSlug}/settings/teams/${t.key.toLowerCase()}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 border border-[#1e2025] rounded-md transition-colors cursor-pointer"
                >
                  <SettingsIcon className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Configure</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
