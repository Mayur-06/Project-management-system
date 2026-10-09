'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function InboxSkeleton() {
  const dummyItems = Array.from({ length: 6 });

  return (
    <div className="space-y-2.5 w-full">
      {dummyItems.map((_, idx) => (
        <div
          key={idx}
          className="p-3.5 rounded-xl border border-border-subtle bg-panel-dark space-y-2.5 shadow-xs"
        >
          {/* Top row: Actor avatar + action description + relative time */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <Skeleton className="w-5 h-5 rounded-full bg-white/[0.08]" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-20 bg-white/[0.08] rounded" />
                <Skeleton className="h-3 w-16 bg-white/[0.05] rounded" />
                <Skeleton className="h-4 w-14 bg-white/[0.06] rounded" />
              </div>
            </div>
            <Skeleton className="h-3 w-12 bg-white/[0.05] rounded" />
          </div>

          {/* Bottom row: Issue title preview + State badge */}
          <div className="pl-7.5 flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-1/2 bg-white/[0.07] rounded" />
            <Skeleton className="h-5 w-20 bg-white/[0.06] rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
