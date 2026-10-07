'use client';

import React from 'react';
import {
  Search,
  Filter,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Sparkles,
  Plus,
  ChevronRight,
  Bell,
  Layers,
} from 'lucide-react';

interface TopNavProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  viewMode?: 'board' | 'list';
  onToggleViewMode?: (mode: 'board' | 'list') => void;
  groupBy?: 'parent' | 'none';
  onToggleGroupBy?: (group: 'parent' | 'none') => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onOpenNewIssue?: () => void;
  onOpenAIAsk?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  title,
  subtitle,
  breadcrumbs = [],
  viewMode = 'board',
  onToggleViewMode,
  groupBy = 'parent',
  onToggleGroupBy,
  searchQuery = '',
  onSearchChange,
  onOpenNewIssue,
  onOpenAIAsk,
}) => {
  return (
    <header className="h-14 border-b border-[#1e2025] bg-[#090a0c]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10 select-none">
      {/* Breadcrumbs & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <span className="hover:text-zinc-200 transition-colors cursor-pointer">{crumb}</span>
              {idx < breadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-600" />}
            </React.Fragment>
          ))}
        </div>
        <div className="h-3.5 w-px bg-zinc-800" />
        <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <span>{title}</span>
          {subtitle && <span className="text-xs font-normal text-zinc-500 font-mono">({subtitle})</span>}
        </h1>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        {onSearchChange && (
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter issues..."
              className="bg-[#121417] text-xs text-zinc-200 pl-8 pr-3 py-1.5 rounded-md border border-[#23262d] focus:border-indigo-500 focus:outline-none w-48 transition-all focus:w-64"
            />
          </div>
        )}

        {/* View Switcher (Board vs List) */}
        {onToggleViewMode && (
          <div className="flex items-center bg-[#121417] border border-[#23262d] rounded-md p-0.5 text-zinc-400">
            <button
              onClick={() => onToggleViewMode('board')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'board' ? 'bg-[#20232b] text-zinc-100 shadow-xs' : 'hover:text-zinc-200'
              }`}
              title="Board View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onToggleViewMode('list')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-[#20232b] text-zinc-100 shadow-xs' : 'hover:text-zinc-200'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Group By Switcher (Only visible in Board view) */}
        {viewMode === 'board' && onToggleGroupBy && (
          <div className="flex items-center bg-[#121417] border border-[#23262d] rounded-md p-0.5 text-zinc-400 text-xs">
            <button
              type="button"
              onClick={() => onToggleGroupBy('parent')}
              className={`px-2 py-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                groupBy === 'parent' ? 'bg-[#20232b] text-zinc-100 font-medium shadow-xs' : 'hover:text-zinc-200'
              }`}
              title="Group by Parent Issue (Horizontal Kanban)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Parent</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleGroupBy('none')}
              className={`px-2 py-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                groupBy === 'none' ? 'bg-[#20232b] text-zinc-100 font-medium shadow-xs' : 'hover:text-zinc-200'
              }`}
              title="No Grouping (Vertical Kanban)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Flat</span>
            </button>
          </div>
        )}

        {/* AI Assistant Button */}
        {onOpenAIAsk && (
          <button
            onClick={onOpenAIAsk}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors shadow-xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
            <span>AI Assistant</span>
          </button>
        )}

        {/* Create Issue Action */}
        {onOpenNewIssue && (
          <button
            onClick={onOpenNewIssue}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-black bg-white hover:bg-zinc-200 transition-colors shadow-xs active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Issue</span>
          </button>
        )}
      </div>
    </header>
  );
};
