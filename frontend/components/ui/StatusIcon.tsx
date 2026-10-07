import React from 'react';
import { StateCategory } from '@/types';
import { cn } from '@/lib/utils';

interface StatusIconProps {
  category?: StateCategory | string;
  name?: string;
  color?: string;
  className?: string;
  size?: number;
}

export const StatusIcon: React.FC<StatusIconProps> = ({
  category,
  name = '',
  color,
  className,
  size = 14,
}) => {
  const normalizedCategory = (category || '').toLowerCase();
  const normalizedName = (name || '').toLowerCase();

  // 1. Duplicate
  if (normalizedName.includes('duplicate')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        width={size}
        height={size}
        className={cn('shrink-0 text-[#71717a]', className)}
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <line x1="4.7" y1="11.3" x2="11.3" y2="4.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // 2. Canceled
  if (normalizedCategory === 'canceled' || normalizedName.includes('cancel')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        width={size}
        height={size}
        className={cn('shrink-0 text-[#71717a]', className)}
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // 3. Done / Completed
  if (normalizedCategory === 'completed' || normalizedName.includes('done')) {
    const iconColor = color || '#5e6ad2';
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        width={size}
        height={size}
        className={cn('shrink-0', className)}
        style={{ color: iconColor }}
      >
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="M4.8 8.2L7 10.4L11.2 5.8"
          stroke="#ffffff"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 4. In Review / QA / Staged (Half-filled circle or 75% circle in emerald green)
  if (
    normalizedCategory === 'started' &&
    (normalizedName.includes('review') ||
      normalizedName.includes('qa') ||
      normalizedName.includes('valid') ||
      normalizedName.includes('prod') ||
      normalizedName.includes('stage'))
  ) {
    const iconColor = color || '#22c55e';
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        width={size}
        height={size}
        className={cn('shrink-0', className)}
        style={{ color: iconColor }}
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        {/* Half circle vertical fill */}
        <path d="M8 2 A6 6 0 0 1 8 14 Z" fill="currentColor" />
      </svg>
    );
  }

  // 5. In Progress / Started (Amber quarter/pie slice)
  if (normalizedCategory === 'started') {
    const iconColor = color || '#f59e0b';
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        width={size}
        height={size}
        className={cn('shrink-0', className)}
        style={{ color: iconColor }}
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        {/* 25% pie slice at top right */}
        <path d="M8 8 L8 2.2 A5.8 5.8 0 0 1 13.8 8 Z" fill="currentColor" />
      </svg>
    );
  }

  // 6. Todo / Unstarted (Hollow outline circle)
  if (normalizedCategory === 'unstarted' || normalizedName.includes('todo')) {
    const iconColor = color || '#e2e8f0';
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        width={size}
        height={size}
        className={cn('shrink-0', className)}
        style={{ color: iconColor }}
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  // 7. Backlog (Dotted outline circle)
  const backlogColor = color || '#8a8f98';
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      style={{ color: backlogColor }}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="2.2 2.6"
        strokeLinecap="round"
      />
    </svg>
  );
};
