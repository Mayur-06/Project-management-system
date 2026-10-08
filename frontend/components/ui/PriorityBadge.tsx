import React from 'react';
import { IssuePriority } from '@/types';
import { SignalPriorityIcon } from '@/components/ui/SignalPriorityIcon';
import { cn } from '@/lib/utils';

interface PriorityBadgeProps {
  priority: IssuePriority;
  showLabel?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  showLabel = false,
  className = '',
  size = 'sm',
}) => {
  const configs: Record<IssuePriority, { color: string; label: string; bg: string }> = {
    urgent: {
      color: 'text-rose-400 font-medium',
      label: 'Urgent',
      bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    },
    high: {
      color: 'text-orange-400 font-medium',
      label: 'High',
      bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    },
    medium: {
      color: 'text-amber-400',
      label: 'Medium',
      bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    low: {
      color: 'text-blue-400',
      label: 'Low',
      bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    },
    none: {
      color: 'text-zinc-400',
      label: 'None',
      bg: 'bg-white/[0.02] text-zinc-400 border-white/[0.06]',
    },
  };

  const current = configs[priority] || configs.none;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-xs select-none transition-colors',
        current.bg,
        className
      )}
      title={`Priority: ${current.label}`}
    >
      <SignalPriorityIcon priority={priority} size={size} />
      {showLabel && <span className={current.color}>{current.label}</span>}
    </div>
  );
};
