import React from 'react';
import { IssuePriority } from '@/types';
import { AlertCircle, ArrowUp, ArrowRight, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriorityBadgeProps {
  priority: IssuePriority;
  showLabel?: boolean;
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, showLabel = false, className = '' }) => {
  const configs: Record<IssuePriority, { icon: React.ReactNode; color: string; label: string; bg: string }> = {
    urgent: {
      icon: <AlertCircle className="w-3.5 h-3.5 text-priority-urgent" />,
      color: 'text-priority-urgent font-medium',
      label: 'Urgent',
      bg: 'bg-priority-urgent/10 text-priority-urgent border-priority-urgent/30',
    },
    high: {
      icon: <ArrowUp className="w-3.5 h-3.5 text-priority-high" />,
      color: 'text-priority-high font-medium',
      label: 'High',
      bg: 'bg-priority-high/10 text-priority-high border-priority-high/30',
    },
    medium: {
      icon: <ArrowRight className="w-3.5 h-3.5 text-priority-medium" />,
      color: 'text-priority-medium',
      label: 'Medium',
      bg: 'bg-priority-medium/10 text-priority-medium border-priority-medium/25',
    },
    low: {
      icon: <ArrowDown className="w-3.5 h-3.5 text-priority-low" />,
      color: 'text-priority-low',
      label: 'Low',
      bg: 'bg-priority-low/10 text-priority-low border-priority-low/20',
    },
    none: {
      icon: <Minus className="w-3.5 h-3.5 text-text-quaternary" />,
      color: 'text-text-tertiary',
      label: 'None',
      bg: 'bg-white/[0.02] text-text-tertiary border-border-subtle',
    },
  };

  const current = configs[priority] || configs.none;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-xs font-medium select-none',
        current.bg,
        className
      )}
      title={`Priority: ${current.label}`}
    >
      {current.icon}
      {showLabel && <span className={current.color}>{current.label}</span>}
    </div>
  );
};
