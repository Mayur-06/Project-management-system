'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  FolderKanban,
  Calendar,
  User as UserIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { Project, ProjectHealth } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';

export default function ProjectsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';

  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.getProjects(orgSlug).then(setProjects);
  }, [orgSlug]);

  const renderHealthBadge = (health: ProjectHealth) => {
    switch (health) {
      case 'on_track':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
            <CheckCircle2 className="w-3 h-3 text-white" />
            <span>On Track</span>
          </span>
        );
      case 'at_risk':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            <AlertTriangle className="w-3 h-3 text-zinc-300" />
            <span>At Risk</span>
          </span>
        );
      case 'off_track':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
            <XCircle className="w-3 h-3 text-zinc-400" />
            <span>Off Track</span>
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden font-sans">
      <TopNav
        title="Projects Roadmap"
        subtitle={`${projects.length} initiatives`}
        breadcrumbs={[orgSlug || 'Workspace', teamKey, 'Projects']}
      />

      <div className="flex-1 p-8 overflow-y-auto space-y-6 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <div
              key={project.id}
              className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-all space-y-4 shadow-xs flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  {renderHealthBadge(project.health)}
                  <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {project.target_date}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-white group-hover:text-zinc-200 transition-colors">
                  {project.name}
                </h3>

                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                  {project.summary}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-zinc-800">
                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                    <span>Progress</span>
                    <span className="text-white font-bold">{project.progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Lead */}
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <img
                      src={project.lead?.avatar_url}
                      alt={project.lead?.name}
                      className="w-5 h-5 rounded-full object-cover ring-1 ring-zinc-700"
                    />
                    <span className="text-zinc-300">{project.lead?.name}</span>
                  </div>
                  <span className="text-zinc-500 text-[11px]">Lead</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
