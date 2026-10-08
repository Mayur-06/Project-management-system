'use client';

import React from 'react';
import {
  Search,
  LayoutGrid,
  List,
  Sparkles,
  Plus,
  Layers,
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  groupBy = 'none',
  onToggleGroupBy,
  searchQuery = '',
  onSearchChange,
  onOpenNewIssue,
  onOpenAIAsk,
}) => {
  return (
    <header className="h-13 border-b border-border-subtle bg-canvas-workspace/85 backdrop-blur-md px-5 flex items-center justify-between sticky top-0 z-10 select-none">
      {/* Breadcrumbs & Title */}
      <div className="flex items-center gap-3 min-w-0">
        {breadcrumbs.length > 0 && (
          <>
            <Breadcrumb>
              <BreadcrumbList className="text-xs text-text-tertiary gap-1 sm:gap-1.5">
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={idx}>
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage className="text-text-primary font-medium">
                            {crumb}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink className="hover:text-text-primary transition-colors cursor-pointer text-text-tertiary">
                            {crumb}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast && <BreadcrumbSeparator className="text-zinc-600 [&>svg]:w-3 [&>svg]:h-3" />}
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="h-3 w-px bg-border-divider" />
          </>
        )}

        <h1 className="text-xs font-semibold text-text-primary flex items-center gap-2 truncate">
          <span>{title}</span>
          {subtitle && (
            <span className="text-[11px] font-normal text-text-tertiary font-mono">
              ({subtitle})
            </span>
          )}
        </h1>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Search Bar */}
        {onSearchChange && (
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter issues..."
              className="h-7 text-xs bg-surface-elevated/40 text-text-secondary pl-8 pr-3 w-44 focus:w-60 transition-all border-border-subtle focus-visible:ring-accent-violet/40 placeholder:text-text-quaternary rounded-md"
            />
          </div>
        )}

        {/* View Switcher (Board vs Swimlanes vs List) */}
        {onToggleViewMode && (
          <div className="flex items-center bg-surface-elevated/50 border border-border-subtle rounded-md p-0.5 text-text-tertiary">
            <button
              onClick={() => {
                onToggleViewMode('board');
                onToggleGroupBy?.('none');
              }}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'board' && (!groupBy || groupBy === 'none')
                  ? 'bg-white/[0.08] text-text-primary shadow-xs'
                  : 'hover:text-text-primary'
              }`}
              title="Board View (Flat Vertical Columns)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            {onToggleGroupBy && (
              <button
                onClick={() => {
                  onToggleViewMode('board');
                  onToggleGroupBy('parent');
                }}
                className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                  viewMode === 'board' && groupBy === 'parent'
                    ? 'bg-white/[0.08] text-text-primary shadow-xs'
                    : 'hover:text-text-primary'
                }`}
                title="Horizontal Swimlanes (Group by Parent)"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => onToggleViewMode('list')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white/[0.08] text-text-primary shadow-xs'
                  : 'hover:text-text-primary'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* AI Assistant Button */}
        {onOpenAIAsk && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenAIAsk}
            className="gap-1.5 text-text-secondary hover:text-text-primary bg-surface-elevated/60 border-border-subtle hover:bg-white/[0.08]"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent-violet" />
            <span>AI Assistant</span>
          </Button>
        )}

        {/* Create Issue Action */}
        {onOpenNewIssue && (
          <Button
            variant="default"
            size="sm"
            onClick={onOpenNewIssue}
            className="gap-1.5 bg-brand-primary hover:bg-accent-hover text-white font-medium shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Issue</span>
          </Button>
        )}
      </div>
    </header>
  );
};
