'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { WorkflowState } from '@/types';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusPickerProps {
  states: WorkflowState[];
  currentStateId?: string;
  currentState?: WorkflowState;
  onSelectState: (stateId: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'end' | 'center';
  showLabel?: boolean;
  showChevron?: boolean;
  children?: React.ReactNode;
}

export const StatusPicker: React.FC<StatusPickerProps> = ({
  states,
  currentStateId,
  currentState,
  onSelectState,
  disabled = false,
  className,
  triggerClassName,
  align = 'start',
  showLabel = true,
  showChevron = true,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeState = useMemo(() => {
    if (currentState) return currentState;
    if (currentStateId) return states.find((s) => s.id === currentStateId);
    return states[0];
  }, [currentState, currentStateId, states]);

  const filteredStates = useMemo(() => {
    if (!search.trim()) return states;
    const q = search.toLowerCase();
    return states.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [states, search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setHighlightedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const handleSelect = async (stateId: string) => {
    setOpen(false);
    await onSelectState(stateId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 1-9 direct selection
    const num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 1 && num <= filteredStates.length) {
      e.preventDefault();
      handleSelect(filteredStates[num - 1].id);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filteredStates.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredStates.length) % filteredStates.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredStates[highlightedIndex]) {
        handleSelect(filteredStates[highlightedIndex].id);
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
              'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-[#0f1011] hover:bg-[#141517] border border-white/[0.06] hover:border-white/[0.12] text-zinc-200 transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed group',
              triggerClassName
            )}
          >
            {activeState && (
              <StatusIcon
                category={activeState.category}
                name={activeState.name}
                color={activeState.color}
                size={14}
              />
            )}
            {showLabel && <span className="truncate max-w-[120px]">{activeState?.name || 'Status'}</span>}
            {showChevron && (
              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 ml-0.5 shrink-0 transition-transform duration-150" />
            )}
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-56 p-1 bg-[#141517] border border-white/[0.08] shadow-2xl rounded-lg text-zinc-200 select-none z-50 animate-in fade-in-0 zoom-in-95',
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
            placeholder="Change status..."
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none border-none p-0 focus:ring-0"
          />
          <kbd className="text-[10px] font-mono text-zinc-500 px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
            S
          </kbd>
        </div>

        {/* State Options List */}
        <div className="max-h-64 overflow-y-auto space-y-0.5 py-0.5">
          {filteredStates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500 text-center">No status found</div>
          ) : (
            filteredStates.map((s, idx) => {
              const isSelected = activeState?.id === s.id;
              const isHighlighted = highlightedIndex === idx;
              const shortcutNumber = idx < 9 ? idx + 1 : null;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={cn(
                    'w-full px-2 py-1.5 flex items-center justify-between text-xs rounded-md transition-colors text-left cursor-pointer group',
                    isHighlighted ? 'bg-white/[0.06] text-white' : 'text-zinc-300 hover:text-white',
                    isSelected && 'font-medium'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusIcon
                      category={s.category}
                      name={s.name}
                      color={s.color}
                      size={14}
                    />
                    <span className="truncate">{s.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {isSelected && <Check className="w-3.5 h-3.5 text-zinc-300" />}
                    {shortcutNumber && (
                      <span className="text-[10px] font-mono text-zinc-500 opacity-60 group-hover:opacity-100">
                        {shortcutNumber}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
