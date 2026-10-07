import React from 'react';
import { WorkflowState } from '@/types';
import { Circle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StateBadgeProps {
  state?: WorkflowState;
  showIcon?: boolean;
  className?: string;
}

export const StateBadge: React.FC<StateBadgeProps> = ({ state, showIcon = true, className = '' }) => {
  if (!state) return null;

  const renderIcon = () => {
    switch (state.category) {
      case 'backlog':
        return <Circle className="w-3.5 h-3.5 text-zinc-500 stroke-dashed" />;
      case 'unstarted':
        return <Circle className="w-3.5 h-3.5 text-zinc-400" />;
      case 'started':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'canceled':
        return <XCircle className="w-3.5 h-3.5 text-zinc-500" />;
      default:
        return <Circle className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-surface-elevated/70 border border-border-subtle text-text-secondary select-none',
        className
      )}
    >
      {showIcon && renderIcon()}
      <span>{state.name}</span>
    </div>
  );
};
