'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface SettingsSkeletonProps {
  variant?: 'table' | 'form' | 'team';
}

export function SettingsSkeleton({ variant = 'table' }: SettingsSkeletonProps) {
  return (
    <div className="max-w-4xl space-y-8 font-sans animate-in fade-in duration-300">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1e2025]">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36 bg-white/[0.08] rounded" />
          <Skeleton className="h-3 w-64 bg-white/[0.04] rounded" />
        </div>
        {variant === 'table' && (
          <Skeleton className="h-8 w-48 bg-white/[0.06] rounded-lg" />
        )}
      </div>

      {variant === 'form' ? (
        /* Form Variant */
        <div className="space-y-6">
          <div className="p-6 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32 bg-white/[0.08] rounded" />
              <Skeleton className="h-9 w-full bg-white/[0.04] rounded-lg" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 bg-white/[0.08] rounded" />
              <Skeleton className="h-9 w-full bg-white/[0.04] rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-9 w-28 bg-white/[0.08] rounded-lg" />
          </div>
        </div>
      ) : variant === 'team' ? (
        /* Team Settings Variant */
        <div className="space-y-6">
          <div className="p-6 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-5">
            <Skeleton className="h-4 w-40 bg-white/[0.08] rounded" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-9 bg-white/[0.04] rounded-lg" />
              <Skeleton className="h-9 bg-white/[0.04] rounded-lg" />
            </div>
          </div>
          <div className="p-6 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-4">
            <Skeleton className="h-4 w-32 bg-white/[0.08] rounded" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-[#1e2025]">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-7 h-7 rounded-full bg-white/[0.08]" />
                    <Skeleton className="h-3.5 w-32 bg-white/[0.06] rounded" />
                  </div>
                  <Skeleton className="h-6 w-16 bg-white/[0.04] rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Table Variant (e.g. Members) */
        <div className="space-y-5">
          {/* Action card placeholder */}
          <div className="p-5 bg-[#0f1011] border border-[#1e2025] rounded-xl space-y-4">
            <Skeleton className="h-4 w-36 bg-white/[0.08] rounded" />
            <div className="flex gap-3">
              <Skeleton className="h-9 flex-1 bg-white/[0.04] rounded-lg" />
              <Skeleton className="h-9 w-28 bg-white/[0.06] rounded-lg" />
              <Skeleton className="h-9 w-24 bg-white/[0.08] rounded-lg" />
            </div>
          </div>

          {/* Table placeholder */}
          <div className="border border-[#1e2025] rounded-xl overflow-hidden bg-[#0f1011]">
            <div className="p-4 border-b border-[#1e2025] flex justify-between">
              <Skeleton className="h-4 w-24 bg-white/[0.06] rounded" />
              <Skeleton className="h-4 w-16 bg-white/[0.06] rounded" />
            </div>
            <div className="divide-y divide-[#1e2025]/60">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="px-4 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-7 h-7 rounded-full bg-white/[0.08]" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-28 bg-white/[0.07] rounded" />
                      <Skeleton className="h-2.5 w-40 bg-white/[0.04] rounded" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16 bg-white/[0.05] rounded-full" />
                  <Skeleton className="h-4 w-12 bg-white/[0.05] rounded" />
                  <Skeleton className="h-4 w-20 bg-white/[0.04] rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
