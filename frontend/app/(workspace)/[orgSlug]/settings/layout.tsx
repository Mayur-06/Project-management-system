'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { 
  Building2, 
  Users, 
  User, 
  Settings,
  Building,
  UserPlus,
  Mail,
  Shield,
  LogOut
} from 'lucide-react';
import { Organization, Team, WorkspaceMember, User as UserType } from '@/types';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/WorkspaceContext';

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const orgSlug = (params?.orgSlug as string) || '';
  const { currentTeam, currentUser, workspaceUsers, organization } = useWorkspace();
  
  const [activeSection, setActiveSection] = useState<'workspace' | 'members' | 'profile'>('workspace');
  const [orgName, setOrgName] = useState(organization?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (pathname) {
      if (pathname.includes('/settings/workspace')) {
        setActiveSection('workspace');
      } else if (pathname.includes('/settings/members')) {
        setActiveSection('members');
      } else if (pathname.includes('/settings/profile')) {
        setActiveSection('profile');
      }
    }
  }, [pathname]);

  useEffect(() => {
    setIsLoading(false);
  }, [organization, currentTeam]);

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      if (organization?.slug && orgName.trim() !== organization.name) {
        const updatedOrg = await api.updateWorkspace(organization.slug, { name: orgName.trim() });
        if (updatedOrg) {
          // Force re-render or use router.refresh() if needed
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2500);
        }
      }
    } catch (err) {
      console.error('Failed to update workspace', err);
    } finally {
      setIsSaving(false);
    }
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

  const currentMember = workspaceUsers.find((m) => m.user?.email === currentUser?.email);
  const isAdmin = currentMember?.role === 'admin' || currentUser?.id === '00000000-0000-0000-0000-000000000001';

  const sections = [
    { id: 'workspace', label: 'Workspace', icon: Building2, href: `/${orgSlug}/settings/workspace` },
    { id: 'members', label: 'Members', icon: Users, href: `/${orgSlug}/settings/members` },
    { id: 'profile', label: 'Profile', icon: User, href: `/${orgSlug}/settings/profile` },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen bg-black text-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-zinc-400">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden font-sans">
      {/* Settings Sidebar */}
      <aside className="w-64 h-screen bg-black border-r border-zinc-800 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-zinc-400" />
            Settings
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {sections.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;
            return (
              <Link
                key={section.id}
                href={section.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-900 text-indigo-400 border border-indigo-500/50'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-zinc-400'}`} />
                {section.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-black">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-2xl font-bold text-white capitalize">
            {sections.find(s => s.id === activeSection)?.label || 'Settings'}
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your {activeSection === 'workspace' ? 'organization' : activeSection === 'members' ? 'team members' : 'personal profile'} settings
          </p>
        </div>

        <div className="flex-1 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}