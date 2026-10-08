'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Label } from '@/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, Search, Tag, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LabelPickerProps {
  availableLabels: Label[];
  selectedLabelIds: string[];
  onToggleLabel: (labelId: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'end' | 'center';
  showLabel?: boolean;
  showChevron?: boolean;
  children?: React.ReactNode;
}

export const LabelPicker: React.FC<LabelPickerProps> = ({
  availableLabels = [],
  selectedLabelIds = [],
  onToggleLabel,
  disabled = false,
  className,
  triggerClassName,
  align = 'start',
  showLabel = false,
  showChevron = false,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredLabels = useMemo(() => {
    if (!search.trim()) return availableLabels;
    const q = search.toLowerCase();
    return availableLabels.filter((l) => l.name.toLowerCase().includes(q));
  }, [availableLabels, search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

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
              'inline-flex items-center gap-1.5 p-1 rounded hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer select-none text-xs group/label',
              disabled && 'opacity-50 cursor-not-allowed',
              triggerClassName
            )}
            title="Add label"
          >
            <Tag className="w-3.5 h-3.5" />
            {showLabel && <span className="text-xs">Labels</span>}
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
      >
        {/* Header Search Input */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/[0.06] mb-1">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Change labels..."
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none border-none p-0 focus:ring-0"
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-0.5">
          {filteredLabels.map((lbl) => {
            const isSelected = selectedLabelIds.includes(lbl.id);
            return (
              <button
                key={lbl.id}
                type="button"
                onClick={async () => {
                  await onToggleLabel(lbl.id);
                }}
                className={cn(
                  'w-full px-2 py-1.5 flex items-center justify-between text-xs rounded transition-colors text-left cursor-pointer',
                  isSelected
                    ? 'bg-white/[0.08] text-white font-medium'
                    : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: lbl.color || '#71717a' }}
                  />
                  <span className="truncate">{lbl.name}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
              </button>
            );
          })}

          {filteredLabels.length === 0 && (
            <div className="py-3 px-2 text-center text-xs text-zinc-500">
              No labels found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
