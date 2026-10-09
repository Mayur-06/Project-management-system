'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function WorkspaceSidebarSkeleton() {
  return (
    <aside className="w-64 h-screen bg-panel-dark border-r border-border-subtle flex flex-col justify-between select-none p-3 font-sans">
      <div className="space-y-4">
        {/* Workspace selector skeleton */}
        <div className="flex items-center gap-2 p-1">
          <Skeleton className="w-6 h-6 rounded bg-white/[0.08]" />
          <Skeleton className="h-4 w-28 bg-white/[0.08] rounded" />
        </div>

        {/* Action button skeleton */}
        <Skeleton className="h-8 w-full bg-white/[0.06] rounded-md" />

        {/* Nav items skeleton */}
        <div className="space-y-1.5 pt-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-2.5 px-2 py-1.5">
              <Skeleton className="w-4 h-4 rounded bg-white/[0.06]" />
              <Skeleton className="h-3.5 w-24 bg-white/[0.06] rounded" />
            </div>
          ))}
        </div>

        {/* Teams section skeleton */}
        <div className="pt-4 space-y-2">
          <Skeleton className="h-3 w-16 bg-white/[0.04] rounded px-2" />
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-2 px-2 py-1">
                <Skeleton className="w-3.5 h-3.5 rounded bg-white/[0.05]" />
                <Skeleton className="h-3 w-20 bg-white/[0.05] rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* User profile footer */}
      <div className="p-1 flex items-center gap-2 border-t border-white/[0.05] pt-3">
        <Skeleton className="w-6 h-6 rounded-full bg-white/[0.08]" />
        <Skeleton className="h-3.5 w-24 bg-white/[0.06] rounded" />
      </div>
    </aside>
  );
}
