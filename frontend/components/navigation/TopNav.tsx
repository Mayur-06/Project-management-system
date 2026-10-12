'use client';

import React from 'react';
import Link from 'next/link';
import {
  Menu,
  Search,
  LayoutGrid,
  List,
  Sparkles,
  Plus,
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
  title?: string;
  subtitle?: string;
  breadcrumbs?: (string | { label: string; href?: string })[];
  viewMode?: 'board' | 'list';
  onToggleViewMode?: (mode: 'board' | 'list') => void;
  groupBy?: 'parent' | 'none';
  onToggleGroupBy?: (group: 'parent' | 'none') => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onOpenNewIssue?: () => void;
  onOpenAIAsk?: () => void;
  actions?: React.ReactNode;
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
  actions,
}) => {
  const handleOpenMobileNav = () => {
    window.dispatchEvent(new CustomEvent('openMobileNav'));
  };

  return (
    <header className="h-13 border-b border-border-subtle bg-canvas-workspace/85 backdrop-blur-md px-3 sm:px-5 flex items-center justify-between sticky top-0 z-10 select-none">
      {/* Left: Mobile Hamburger + Breadcrumbs / Title */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1 mr-2">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={handleOpenMobileNav}
          className="p-1.5 -ml-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-white/[0.06] md:hidden cursor-pointer shrink-0"
          title="Open navigation"
          aria-label="Open navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Breadcrumbs & Title */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="text-xs text-text-tertiary gap-1 sm:gap-1.5 flex-nowrap">
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  const label = typeof crumb === 'string' ? crumb : crumb.label;
                  const href = typeof crumb === 'string' ? undefined : crumb.href;

                  return (
                    <React.Fragment key={idx}>
                      <BreadcrumbItem className={!isLast ? 'hidden sm:inline-flex' : 'truncate'}>
                        {isLast ? (
                          <BreadcrumbPage className="text-text-primary font-medium truncate max-w-[120px] sm:max-w-[200px]">
                            {label}
                          </BreadcrumbPage>
                        ) : href ? (
                          <Link
                            href={href}
                            className="hover:text-text-primary transition-colors cursor-pointer text-text-tertiary truncate max-w-[100px]"
                          >
                            {label}
                          </Link>
                        ) : (
                          <BreadcrumbLink className="hover:text-text-primary transition-colors cursor-pointer text-text-tertiary truncate max-w-[100px]">
                            {label}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast && (
                        <BreadcrumbSeparator className="hidden sm:inline-flex text-zinc-600 [&>svg]:w-3 [&>svg]:h-3" />
                      )}
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
            {title && <div className="hidden sm:block h-3 w-px bg-border-divider shrink-0" />}
          </div>
        )}

        {title && (
          <h1 className="text-xs font-semibold text-text-primary hidden sm:flex items-center gap-1.5 truncate">
            <span className="truncate">{title}</span>
            {subtitle && (
              <span className="text-[11px] font-normal text-text-tertiary font-mono shrink-0">
                ({subtitle})
              </span>
            )}
          </h1>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {actions}

        {/* Search Bar */}
        {onSearchChange && (
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter..."
              className="h-7 text-xs bg-surface-elevated/40 text-text-secondary pl-7 sm:pl-8 pr-2 sm:pr-3 w-24 sm:w-44 sm:focus:w-60 transition-all border-border-subtle focus-visible:ring-accent-violet/40 placeholder:text-text-quaternary rounded-md"
            />
          </div>
        )}

        {/* View Switcher (Board vs List) */}
        {onToggleViewMode && (
          <div className="flex items-center bg-surface-elevated/50 border border-border-subtle rounded-md p-0.5 text-text-tertiary">
            <button
              onClick={() => {
                onToggleViewMode('board');
                onToggleGroupBy?.('none');
              }}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'board'
                  ? 'bg-white/[0.08] text-text-primary shadow-xs'
                  : 'hover:text-text-primary'
              }`}
              title="Board View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
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
            className="h-7 px-2 sm:px-3 gap-1.5 text-text-secondary hover:text-text-primary bg-surface-elevated/60 border-border-subtle hover:bg-white/[0.08]"
            title="AI Assistant"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent-violet shrink-0" />
            <span className="hidden sm:inline text-xs">AI Assistant</span>
          </Button>
        )}

        {/* Create Issue Action */}
        {onOpenNewIssue && (
          <Button
            variant="default"
            size="sm"
            onClick={onOpenNewIssue}
            className="h-7 px-2 sm:px-3 gap-1 sm:gap-1.5 bg-brand-primary hover:bg-accent-hover text-white font-medium shadow-xs"
            title="New Issue"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
            <span className="hidden sm:inline text-xs">New Issue</span>
          </Button>
        )}
      </div>
    </header>
  );
};
