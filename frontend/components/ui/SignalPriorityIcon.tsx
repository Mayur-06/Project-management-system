import React from 'react';
import { IssuePriority } from '@/types';
import { cn } from '@/lib/utils';

interface SignalPriorityIconProps {
  priority: IssuePriority;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export const SignalPriorityIcon: React.FC<SignalPriorityIconProps> = ({
  priority,
  className = '',
  size = 'sm',
}) => {
  const sizeMap = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  const dimension = sizeMap[size] || sizeMap.sm;

  switch (priority) {
    case 'urgent':
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(dimension, 'text-rose-500 shrink-0 select-none', className)}
          aria-label="Urgent Priority"
        >
          <rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.85" fill="currentColor" />
        </svg>
      );

    case 'high':
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(dimension, 'text-orange-500 shrink-0 select-none', className)}
          aria-label="High Priority"
        >
          {/* Bar 1 (Low) */}
          <rect x="2.5" y="10" width="2.5" height="4" rx="0.75" fill="currentColor" />
          {/* Bar 2 (Medium) */}
          <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="0.75" fill="currentColor" />
          {/* Bar 3 (High) */}
          <rect x="11" y="3" width="2.5" height="11" rx="0.75" fill="currentColor" />
        </svg>
      );

    case 'medium':
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(dimension, 'text-amber-500 shrink-0 select-none', className)}
          aria-label="Medium Priority"
        >
          {/* Bar 1 (Low) */}
          <rect x="2.5" y="10" width="2.5" height="4" rx="0.75" fill="currentColor" />
          {/* Bar 2 (Medium) */}
          <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="0.75" fill="currentColor" />
          {/* Bar 3 (Unfilled) */}
          <rect x="11" y="3" width="2.5" height="11" rx="0.75" fill="currentColor" fillOpacity="0.18" />
        </svg>
      );

    case 'low':
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(dimension, 'text-blue-500 shrink-0 select-none', className)}
          aria-label="Low Priority"
        >
          {/* Bar 1 (Low) */}
          <rect x="2.5" y="10" width="2.5" height="4" rx="0.75" fill="currentColor" />
          {/* Bar 2 (Unfilled) */}
          <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="0.75" fill="currentColor" fillOpacity="0.18" />
          {/* Bar 3 (Unfilled) */}
          <rect x="11" y="3" width="2.5" height="11" rx="0.75" fill="currentColor" fillOpacity="0.18" />
        </svg>
      );

    case 'none':
    default:
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(dimension, 'text-zinc-500 shrink-0 select-none', className)}
          aria-label="No Priority"
        >
          {/* 3 horizontal dashes '---' */}
          <rect x="2.5" y="7" width="2.75" height="2" rx="0.6" fill="currentColor" />
          <rect x="6.6" y="7" width="2.75" height="2" rx="0.6" fill="currentColor" />
          <rect x="10.75" y="7" width="2.75" height="2" rx="0.6" fill="currentColor" />
        </svg>
      );
  }
};
