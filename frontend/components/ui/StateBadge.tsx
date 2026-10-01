import React from 'react';
import { WorkflowState } from '@/types';
import { Circle, CheckCircle2, HelpCircle, XCircle, Clock } from 'lucide-react';

interface StateBadgeProps {
  state?: WorkflowState;
  showIcon?: boolean;
  className?: string;
}

export const StateBadge: React.FC<StateBadgeProps> = ({ state, showIcon = true, className = '' }) => {
  if (!state) return null;

  const renderIcon = () => {
    switch (state.category) {
      case 'triage':
        return <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />;
      case 'backlog':
        return <Circle className="w-3.5 h-3.5 text-zinc-500 stroke-dashed" />;
      case 'unstarted':
        return <Circle className="w-3.5 h-3.5 text-zinc-400" />;
      case 'started':
        return <Clock className="w-3.5 h-3.5 text-zinc-200" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-white" />;
      case 'canceled':
        return <XCircle className="w-3.5 h-3.5 text-zinc-500" />;
      default:
        return <Circle className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-950 border border-zinc-800 text-zinc-200 ${className}`}
    >
      {showIcon && renderIcon()}
      <span>{state.name}</span>
    </div>
  );
};
