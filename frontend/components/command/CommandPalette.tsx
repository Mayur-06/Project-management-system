'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Command,
  Plus,
  Sparkles,
  Inbox,
  Layers,
  Repeat,
  FolderKanban,
  Hash,
  X,
} from 'lucide-react';
import { Team } from '@/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewIssue: () => void;
  onOpenAIAsk: () => void;
  orgSlug?: string;
  currentTeamKey?: string;
  teams?: Team[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenNewIssue,
  onOpenAIAsk,
  orgSlug = '',
  currentTeamKey = '',
  teams = [],
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const activeKey = (currentTeamKey || teams[0]?.key || '').toLowerCase();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'new_issue',
      title: 'Create new issue',
      shortcut: 'C',
      icon: <Plus className="w-4 h-4 text-indigo-400" />,
      run: () => {
        onClose();
        onOpenNewIssue();
      },
    },
    {
      id: 'ai_assistant',
      title: 'Ask AI Assistant',
      shortcut: 'AI',
      icon: <Sparkles className="w-4 h-4 text-white" />,
      run: () => {
        onClose();
        onOpenAIAsk();
      },
    },
    {
      id: 'nav_issues',
      title: 'Go to Issues Board',
      shortcut: 'G I',
      icon: <Layers className="w-4 h-4 text-zinc-400" />,
      run: () => {
        router.push(activeKey ? `/${orgSlug}/${activeKey}/issues` : `/${orgSlug}/issues`);
        onClose();
      },
    },
    {
      id: 'nav_triage',
      title: 'Go to Triage Inbox',
      shortcut: 'G T',
      icon: <Inbox className="w-4 h-4 text-pink-400" />,
      run: () => {
        router.push(activeKey ? `/${orgSlug}/${activeKey}/triage` : `/${orgSlug}/triage`);
        onClose();
      },
    },
    ...teams.map((t) => ({
      id: `team_${t.key}`,
      title: `Switch Team to ${t.name} (${t.key})`,
      shortcut: t.key,
      icon: <Hash className="w-4 h-4 text-blue-400" />,
      run: () => {
        router.push(`/${orgSlug}/${t.key.toLowerCase()}/issues`);
        onClose();
      },
    })),
  ];

  const filtered = actions.filter((a) => a.title.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (idx: number) => {
    if (filtered[idx]) {
      filtered[idx].run();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-xs animate-fade-in p-4">
      <div
        className="w-full max-w-xl bg-[#0f1013] border border-[#23262d] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-[#1c1f26] gap-3">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % filtered.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                handleSelect(selectedIndex);
              }
            }}
            placeholder="Type a command or search..."
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">No matching commands found.</div>
          ) : (
            filtered.map((action, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={action.id}
                  onClick={() => handleSelect(idx)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition-colors ${
                    isSelected ? 'bg-white text-black font-semibold' : 'text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {action.icon}
                    <span>{action.title}</span>
                  </div>
                  {action.shortcut && (
                    <kbd className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isSelected ? 'bg-black text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                    }`}>
                      {action.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#1a1c22] bg-[#0c0d10] flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span>Navigation:</span>
            <kbd className="bg-[#181a20] px-1 py-0.5 rounded border border-[#242730]">↑</kbd>
            <kbd className="bg-[#181a20] px-1 py-0.5 rounded border border-[#242730]">↓</kbd>
            <kbd className="bg-[#181a20] px-1.5 py-0.5 rounded border border-[#242730]">↵</kbd>
          </div>
          <span>Commands</span>
        </div>
      </div>
    </div>
  );
};
