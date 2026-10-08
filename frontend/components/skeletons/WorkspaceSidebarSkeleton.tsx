'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function WorkspaceSidebarSkeleton() {
  return (
    <aside className="w-64 h-screen bg-panel-dark border-r border-border-subtle flex flex-col justify-between select-none text-sm z-20 font-sans">
      <div className="flex flex-col">
        {/* Workspace Switcher Header Skeleton */}
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5 w-full p-1">
            <Skeleton className="w-6 h-6 rounded bg-white/[0.08] shrink-0" />
            <div className="flex items-center justify-between flex-1 min-w-0">
              <Skeleton className="h-4 w-24 bg-white/[0.08]" />
              <Skeleton className="w-3.5 h-3.5 rounded bg-white/[0.06] shrink-0" />
            </div>
          </div>
        </div>

        {/* Primary Views Skeleton */}
        <div className="px-2 py-2 space-y-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between px-2.5 py-2 rounded-md"
            >
              <div className="flex items-center gap-2.5">
                <Skeleton className="w-4 h-4 rounded bg-white/[0.06]" />
                <Skeleton className="h-3.5 w-20 bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>

        {/* Teams Section Skeleton */}
        <div className="px-2 py-3 space-y-1.5 border-t border-border-subtle">
          <div className="px-2 pb-1 flex items-center justify-between">
            <Skeleton className="h-3 w-14 bg-white/[0.08]" />
            <Skeleton className="w-3.5 h-3.5 rounded bg-white/[0.06]" />
          </div>

          {/* Team 1 Skeleton */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1.5 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <Skeleton className="w-3.5 h-3.5 rounded bg-white/[0.06]" />
                <Skeleton className="w-4 h-4 rounded bg-white/[0.08]" />
                <Skeleton className="h-3.5 w-24 bg-white/[0.08]" />
              </div>
            </div>
            {/* Sub-items */}
            <div className="pl-6 space-y-1">
              <div className="flex items-center gap-2 px-2 py-1">
                <Skeleton className="w-3.5 h-3.5 rounded bg-white/[0.05]" />
                <Skeleton className="h-3 w-16 bg-white/[0.05]" />
              </div>
              <div className="flex items-center gap-2 px-2 py-1">
                <Skeleton className="w-3.5 h-3.5 rounded bg-white/[0.05]" />
                <Skeleton className="h-3 w-14 bg-white/[0.05]" />
              </div>
            </div>
          </div>

          {/* Team 2 Skeleton */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between px-2 py-1.5 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <Skeleton className="w-3.5 h-3.5 rounded bg-white/[0.06]" />
                <Skeleton className="w-4 h-4 rounded bg-white/[0.08]" />
                <Skeleton className="h-3.5 w-20 bg-white/[0.08]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Footer Skeleton */}
      <div className="p-3 border-t border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <Skeleton className="w-7 h-7 rounded-full bg-white/[0.08] shrink-0" />
          <div className="space-y-1 min-w-0">
            <Skeleton className="h-3.5 w-20 bg-white/[0.08]" />
            <Skeleton className="h-2.5 w-28 bg-white/[0.05]" />
          </div>
        </div>
        <Skeleton className="w-4 h-4 rounded bg-white/[0.06] shrink-0" />
      </div>
    </aside>
  );
}
