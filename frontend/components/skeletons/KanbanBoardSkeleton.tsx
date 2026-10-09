'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function KanbanBoardSkeleton() {
  const columns = [
    { titleWidth: 'w-16', cardCount: 3 },
    { titleWidth: 'w-20', cardCount: 2 },
    { titleWidth: 'w-14', cardCount: 2 },
    { titleWidth: 'w-18', cardCount: 1 },
  ];

  return (
    <div className="flex-1 overflow-x-auto p-6 flex gap-6 select-none min-h-[calc(100vh-3.5rem)] font-sans">
      {columns.map((col, colIndex) => (
        <div
          key={colIndex}
          className="w-80 shrink-0 flex flex-col bg-[#0f1011] rounded-xl border border-white/[0.06] overflow-hidden"
        >
          {/* Column Header Skeleton */}
          <div className="p-3 border-b border-white/[0.06] flex items-center justify-between bg-[#121315]">
            <div className="flex items-center gap-2">
              <Skeleton className="w-3.5 h-3.5 rounded-full bg-white/[0.08]" />
              <Skeleton className={`h-3.5 ${col.titleWidth} bg-white/[0.08]`} />
              <Skeleton className="w-4 h-3.5 rounded bg-white/[0.05]" />
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="w-4 h-4 rounded bg-white/[0.05]" />
              <Skeleton className="w-4 h-4 rounded bg-white/[0.05]" />
            </div>
          </div>

          {/* Column Cards Skeleton */}
          <div className="flex-1 p-2 space-y-2 overflow-hidden">
            {Array.from({ length: col.cardCount }).map((_, cardIndex) => (
              <div
                key={cardIndex}
                className="p-3 rounded-lg bg-[#141517] border border-white/[0.06] space-y-2.5 shadow-xs"
              >
                {/* Header: Identifier & Priority */}
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-14 bg-white/[0.08] rounded" />
                  <Skeleton className="w-4 h-4 rounded-full bg-white/[0.08]" />
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <Skeleton className="h-3.5 w-full bg-white/[0.08] rounded" />
                  {cardIndex % 2 === 0 && (
                    <Skeleton className="h-3.5 w-3/4 bg-white/[0.06] rounded" />
                  )}
                </div>

                {/* Footer: Tag + Assignee */}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                  <Skeleton className="h-4 w-12 bg-white/[0.05] rounded-full" />
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-2.5 w-10 bg-white/[0.04] rounded" />
                    <Skeleton className="w-4 h-4 rounded-full bg-white/[0.08]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
