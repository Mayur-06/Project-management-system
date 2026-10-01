import React from 'react';
import { IssuePriority } from '@/types';
import { AlertCircle, ArrowUp, ArrowRight, ArrowDown, Minus } from 'lucide-react';

interface PriorityBadgeProps {
  priority: IssuePriority;
  showLabel?: boolean;
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, showLabel = false, className = '' }) => {
  const configs: Record<IssuePriority, { icon: React.ReactNode; color: string; label: string; bg: string }> = {
    urgent: {
      icon: <AlertCircle className="w-3.5 h-3.5 text-white" />,
      color: 'text-white font-semibold',
      label: 'Urgent',
      bg: 'bg-white text-black border-white',
    },
    high: {
      icon: <ArrowUp className="w-3.5 h-3.5 text-zinc-200" />,
      color: 'text-zinc-200',
      label: 'High',
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700',
    },
    medium: {
      icon: <ArrowRight className="w-3.5 h-3.5 text-zinc-300" />,
      color: 'text-zinc-300',
      label: 'Medium',
      bg: 'bg-zinc-900 text-zinc-300 border-zinc-800',
    },
    low: {
      icon: <ArrowDown className="w-3.5 h-3.5 text-zinc-400" />,
      color: 'text-zinc-400',
      label: 'Low',
      bg: 'bg-zinc-900/60 text-zinc-400 border-zinc-800',
    },
    none: {
      icon: <Minus className="w-3.5 h-3.5 text-zinc-500" />,
      color: 'text-zinc-500',
      label: 'None',
      bg: 'bg-zinc-950 text-zinc-500 border-zinc-900',
    },
  };

  const current = configs[priority] || configs.none;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-xs font-medium ${current.bg} ${className}`}
      title={`Priority: ${current.label}`}
    >
      {current.icon}
      {showLabel && <span className={current.color}>{current.label}</span>}
    </div>
  );
};
