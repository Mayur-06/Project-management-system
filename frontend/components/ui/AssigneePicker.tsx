'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User } from '@/types';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, Search, UserPlus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AssigneePickerProps {
  users?: (User | { id: string; user_id?: string; user?: User; name?: string; email?: string; avatar_url?: string })[];
  currentAssigneeId?: string | null;
  currentAssignee?: User | null;
  onSelectAssignee: (userId: string | null) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'end' | 'center';
  showLabel?: boolean;
  showChevron?: boolean;
  children?: React.ReactNode;
}

export const AssigneePicker: React.FC<AssigneePickerProps> = ({
  users = [],
  currentAssigneeId,
  currentAssignee,
  onSelectAssignee,
  disabled = false,
  className,
  triggerClassName,
  align = 'end',
  showLabel = false,
  showChevron = false,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedUsers = useMemo(() => {
    return users
      .map((u: any) => u.user || u)
      .filter((u: any): u is User => Boolean(u && (u.id || u.user_id)));
  }, [users]);

  const activeAssignee = useMemo(() => {
    if (currentAssignee) return currentAssignee;
    if (currentAssigneeId) {
      return (
        normalizedUsers.find((u) => u.id === currentAssigneeId || (u as any).user_id === currentAssigneeId) ||
        null
      );
    }
    return null;
  }, [currentAssignee, currentAssigneeId, normalizedUsers]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return normalizedUsers;
    const q = search.toLowerCase();
    return normalizedUsers.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [normalizedUsers, search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setHighlightedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const handleSelect = async (userId: string | null) => {
    setOpen(false);
    await onSelectAssignee(userId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Total options = 1 (Unassigned) + filteredUsers.length
      setHighlightedIndex((prev) => (prev + 1) % (filteredUsers.length + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredUsers.length + 1) % (filteredUsers.length + 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex === 0) {
        handleSelect(null);
      } else {
        const selected = filteredUsers[highlightedIndex - 1];
        if (selected) {
          handleSelect(selected.id);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children ? (
          children
        ) : (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex items-center gap-1.5 p-0.5 rounded transition-all cursor-pointer select-none text-xs group/assignee',
              activeAssignee
                ? 'hover:opacity-80'
                : 'text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 focus:opacity-100',
              disabled && 'opacity-50 cursor-not-allowed',
              triggerClassName
            )}
            title={activeAssignee ? `Assigned to ${activeAssignee.name || activeAssignee.email}` : 'Assign to...'}
          >
            {activeAssignee ? (
              <UserAvatar
                name={activeAssignee.name}
                email={activeAssignee.email}
                avatarUrl={activeAssignee.avatar_url}
                size="xs"
              />
            ) : (
              <div className="w-5 h-5 rounded-full border border-dashed border-zinc-700 hover:border-zinc-400 flex items-center justify-center transition-colors">
                <UserPlus className="w-3 h-3 text-zinc-500 group-hover/assignee:text-zinc-300" />
              </div>
            )}
            {showLabel && (
              <span className="font-medium truncate text-zinc-200 text-xs">
                {activeAssignee ? activeAssignee.name || activeAssignee.email : 'Unassigned'}
              </span>
            )}
            {showChevron && (
              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover/assignee:text-zinc-300 ml-0.5 shrink-0 transition-transform duration-150" />
            )}
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-56 p-1 bg-[#141517] border border-white/[0.08] shadow-2xl rounded-lg text-zinc-200 select-none z-50 animate-in fade-in-0 zoom-in-95 font-sans',
          className
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Header Search Input */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/[0.06] mb-1">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Assign to..."
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none border-none p-0 focus:ring-0"
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-0.5">
          {/* Option: Unassigned */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={cn(
              'w-full px-2 py-1.5 flex items-center justify-between text-xs rounded transition-colors text-left cursor-pointer',
              !activeAssignee
                ? 'bg-white/[0.08] text-white font-medium'
                : highlightedIndex === 0
                ? 'bg-white/[0.04] text-white'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
            )}
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border border-dashed border-zinc-600 flex items-center justify-center">
                <span className="text-[10px] text-zinc-500">-</span>
              </div>
              <span>Unassigned</span>
            </div>
            {!activeAssignee && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
          </button>

          {/* User List */}
          {filteredUsers.map((u, idx) => {
            const isSelected = activeAssignee?.id === u.id;
            const isHighlighted = highlightedIndex === idx + 1;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelect(u.id)}
                className={cn(
                  'w-full px-2 py-1.5 flex items-center justify-between text-xs rounded transition-colors text-left cursor-pointer',
                  isSelected
                    ? 'bg-white/[0.08] text-white font-medium'
                    : isHighlighted
                    ? 'bg-white/[0.04] text-white'
                    : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar name={u.name} email={u.email} avatarUrl={u.avatar_url} size="xs" />
                  <span className="truncate">{u.name || u.email}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
              </button>
            );
          })}

          {filteredUsers.length === 0 && search.trim() && (
            <div className="py-3 px-2 text-center text-xs text-zinc-500">
              No members found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
