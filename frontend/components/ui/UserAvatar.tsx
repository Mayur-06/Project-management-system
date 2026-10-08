'use client';

import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  fallbackClassName?: string;
}

// Deterministic pastel/vibrant palette matching Linear's user avatars (e.g. AA, AR, SS)
const COLOR_PALETTE = [
  'bg-emerald-600 text-white',
  'bg-sky-600 text-white',
  'bg-indigo-600 text-white',
  'bg-violet-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-teal-600 text-white',
  'bg-blue-600 text-white',
  'bg-cyan-600 text-white',
  'bg-fuchsia-600 text-white',
];

function getDeterministicColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

function getInitials(name?: string | null, email?: string | null): string {
  const raw = (name || email || 'U').trim();
  const parts = raw.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return raw.slice(0, 2).toUpperCase();
}

const SIZE_MAP = {
  xs: 'w-4 h-4 text-[9px] font-semibold',
  sm: 'w-5 h-5 text-[10px] font-semibold',
  md: 'w-6 h-6 text-[11px] font-semibold',
  lg: 'w-7 h-7 text-xs font-semibold',
  xl: 'w-8 h-8 text-xs font-semibold',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  email,
  avatarUrl,
  size = 'md',
  className,
  fallbackClassName,
}) => {
  const identifier = (email || name || 'user').toLowerCase();
  const colorClass = getDeterministicColor(identifier);
  const initials = getInitials(name, email);
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <Avatar className={cn(sizeClass, 'shrink-0 select-none', className)}>
      {avatarUrl ? (
        <AvatarImage
          src={avatarUrl}
          alt={name || email || 'User'}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback
        className={cn(
          'flex items-center justify-center font-medium leading-none tracking-tight',
          colorClass,
          fallbackClassName
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
};
