'use client';

import React, { useState } from 'react';
import { IssuePriority } from '@/types';
import { SignalPriorityIcon } from '@/components/ui/SignalPriorityIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriorityPickerProps {
  currentPriority: IssuePriority;
  onSelectPriority: (priority: IssuePriority) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'end' | 'center';
  showLabel?: boolean;
  showChevron?: boolean;
  children?: React.ReactNode;
}

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; shortcut: string }[] = [
  { value: 'urgent', label: 'Urgent', shortcut: '1' },
  { value: 'high', label: 'High', shortcut: '2' },
  { value: 'medium', label: 'Medium', shortcut: '3' },
  { value: 'low', label: 'Low', shortcut: '4' },
  { value: 'none', label: 'No Priority', shortcut: '0' },
];

export const PriorityPicker: React.FC<PriorityPickerProps> = ({
  currentPriority,
  onSelectPriority,
  disabled = false,
  className,
  triggerClassName,
  align = 'start',
  showLabel = true,
  showChevron = false,
  children,
}) => {
  const [open, setOpen] = useState(false);

  const activeOption = PRIORITY_OPTIONS.find((opt) => opt.value === currentPriority) || PRIORITY_OPTIONS[4];

  const handleSelect = async (priority: IssuePriority) => {
    setOpen(false);
    if (priority !== currentPriority) {
      await onSelectPriority(priority);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const keyMap: Record<string, IssuePriority> = {
      '1': 'urgent',
      '2': 'high',
      '3': 'medium',
      '4': 'low',
      '0': 'none',
    };
    if (keyMap[e.key]) {
      e.preventDefault();
      handleSelect(keyMap[e.key]);
      return;
    }
    if (e.key === 'Escape') {
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
              'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors select-none group/priority cursor-pointer',
              'bg-surface-elevated/40 hover:bg-surface-elevated border border-border-subtle hover:border-border-standard text-text-secondary hover:text-text-primary',
              disabled && 'opacity-50 cursor-not-allowed',
              triggerClassName
            )}
          >
            <SignalPriorityIcon priority={currentPriority} size="xs" />
            {showLabel && (
              <span className="font-medium truncate text-zinc-200">
                {activeOption.label}
              </span>
            )}
            {showChevron && (
              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover/priority:text-zinc-300 transition-colors shrink-0 ml-auto" />
            )}
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-48 p-1 bg-[#141517] border border-white/[0.08] text-white shadow-2xl rounded-lg font-sans z-50',
          className
        )}
      >
        <div className="px-2 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
          Set Priority
        </div>
        <div className="space-y-0.5 mt-0.5">
          {PRIORITY_OPTIONS.map((opt) => {
            const isSelected = opt.value === currentPriority;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'w-full px-2 py-1.5 flex items-center justify-between text-xs rounded transition-colors text-left cursor-pointer',
                  isSelected
                    ? 'bg-white/[0.08] text-white font-medium'
                    : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                )}
              >
                <div className="flex items-center gap-2">
                  <SignalPriorityIcon priority={opt.value} size="sm" />
                  <span>{opt.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-500">{opt.shortcut}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
