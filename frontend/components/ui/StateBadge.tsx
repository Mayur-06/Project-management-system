import React from 'react';
import { WorkflowState } from '@/types';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StateBadgeProps {
  state?: WorkflowState;
  showIcon?: boolean;
  className?: string;
}

export const StateBadge: React.FC<StateBadgeProps> = ({ state, showIcon = true, className = '' }) => {
  if (!state) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-surface-elevated/70 border border-border-subtle text-text-secondary select-none font-normal',
        className
      )}
    >
      {showIcon && (
        <StatusIcon
          category={state.category}
          name={state.name}
          color={state.color}
          size={14}
        />
      )}
      <span>{state.name}</span>
    </Badge>
  );
};
