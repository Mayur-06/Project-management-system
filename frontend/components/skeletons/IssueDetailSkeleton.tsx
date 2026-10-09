'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function IssueDetailSkeleton() {
  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-background">
      {/* Top Navigation Bar Skeleton */}
      <div className="h-14 border-b border-white/[0.06] px-6 flex items-center justify-between bg-panel-dark/50">
        <div className="flex items-center gap-3">
          <Skeleton className="w-6 h-6 rounded bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 bg-white/[0.06] rounded" />
            <span className="text-zinc-600">/</span>
            <Skeleton className="h-4 w-20 bg-white/[0.08] rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-8 h-8 rounded-md bg-white/[0.06]" />
          <Skeleton className="w-8 h-8 rounded-md bg-white/[0.06]" />
        </div>
      </div>

      {/* Main Content & Sidebar Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Main Content Column */}
        <div className="flex-1 p-6 sm:p-8 overflow-y-auto space-y-6 max-w-4xl">
          {/* Issue Title Skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4 bg-white/[0.09] rounded-md" />
            <Skeleton className="h-8 w-1/2 bg-white/[0.06] rounded-md" />
          </div>

          {/* Attachment Bar Skeleton */}
          <div className="flex items-center gap-2 py-1">
            <Skeleton className="h-7 w-28 rounded-md bg-white/[0.06]" />
          </div>

          {/* Description Canvas Skeleton */}
          <div className="space-y-3 pt-2">
            <Skeleton className="h-4 w-full bg-white/[0.07] rounded" />
            <Skeleton className="h-4 w-11/12 bg-white/[0.06] rounded" />
            <Skeleton className="h-4 w-4/5 bg-white/[0.06] rounded" />
            <Skeleton className="h-24 w-full bg-white/[0.04] rounded-lg mt-3" />
          </div>

          {/* Sub-issues Section Skeleton */}
          <div className="space-y-3 pt-6 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24 bg-white/[0.08] rounded" />
              <Skeleton className="w-5 h-5 rounded bg-white/[0.05]" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-9 w-full bg-white/[0.05] rounded-lg" />
              <Skeleton className="h-9 w-full bg-white/[0.04] rounded-lg" />
            </div>
          </div>

          {/* Activity Section Skeleton */}
          <div className="space-y-4 pt-8 border-t border-white/[0.06]">
            <Skeleton className="h-4 w-20 bg-white/[0.08] rounded" />
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-4 h-4 rounded-full bg-white/[0.08]" />
                <Skeleton className="h-3.5 w-64 bg-white/[0.06] rounded" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="w-4 h-4 rounded-full bg-white/[0.08]" />
                <Skeleton className="h-3.5 w-48 bg-white/[0.06] rounded" />
              </div>
            </div>

            {/* Comment Composer Box Skeleton */}
            <Skeleton className="h-24 w-full bg-white/[0.05] rounded-xl mt-4" />
          </div>
        </div>

        {/* Right Properties Panel Skeleton */}
        <div className="w-72 lg:w-80 border-l border-white/[0.06] bg-panel-dark/30 p-5 space-y-6 hidden md:block">
          <Skeleton className="h-3.5 w-24 bg-white/[0.08] rounded" />

          <div className="space-y-4">
            {/* Status Property */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16 bg-white/[0.05] rounded" />
              <Skeleton className="h-6 w-24 bg-white/[0.07] rounded-md" />
            </div>

            {/* Priority Property */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16 bg-white/[0.05] rounded" />
              <Skeleton className="h-6 w-20 bg-white/[0.07] rounded-md" />
            </div>

            {/* Assignee Property */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16 bg-white/[0.05] rounded" />
              <Skeleton className="h-6 w-28 bg-white/[0.07] rounded-md" />
            </div>

            {/* Labels Property */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16 bg-white/[0.05] rounded" />
              <Skeleton className="h-6 w-20 bg-white/[0.07] rounded-md" />
            </div>

            {/* Due Date Property */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16 bg-white/[0.05] rounded" />
              <Skeleton className="h-6 w-24 bg-white/[0.07] rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
