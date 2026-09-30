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
      icon: <AlertCircle className="w-3.5 h-3.5 text-rose-500" />,
      color: 'text-rose-400',
      label: 'Urgent',
      bg: 'bg-rose-500/10 border-rose-500/20',
    },
    high: {
      icon: <ArrowUp className="w-3.5 h-3.5 text-orange-400" />,
      color: 'text-orange-400',
      label: 'High',
      bg: 'bg-orange-500/10 border-orange-500/20',
    },
    medium: {
      icon: <ArrowRight className="w-3.5 h-3.5 text-yellow-400" />,
      color: 'text-yellow-400',
      label: 'Medium',
      bg: 'bg-yellow-500/10 border-yellow-500/20',
    },
    low: {
      icon: <ArrowDown className="w-3.5 h-3.5 text-blue-400" />,
      color: 'text-blue-400',
      label: 'Low',
      bg: 'bg-blue-500/10 border-blue-500/20',
    },
    none: {
      icon: <Minus className="w-3.5 h-3.5 text-zinc-500" />,
      color: 'text-zinc-500',
      label: 'No Priority',
      bg: 'bg-zinc-800/40 border-zinc-700/30',
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
