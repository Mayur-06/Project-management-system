'use client';

import React from 'react';
import { Issue } from '@/types';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

interface IssueBreadcrumbPathProps {
  ancestors: Issue[];
  currentIdentifier?: string;
  currentTitle?: string;
  className?: string;
  onClickAncestor?: (issue: Issue) => void;
}

export const IssueBreadcrumbPath: React.FC<IssueBreadcrumbPathProps> = ({
  ancestors,
  currentIdentifier,
  currentTitle,
  className = '',
  onClickAncestor,
}) => {
  if (!ancestors || ancestors.length === 0) {
    return null;
  }

  // Construct full path for tooltip
  const fullPath = [
    ...ancestors.map((a) => `${a.identifier}: ${a.title}`),
    currentIdentifier && currentTitle ? `${currentIdentifier}: ${currentTitle}` : currentIdentifier,
  ]
    .filter(Boolean)
    .join(' > ');

  return (
    <Breadcrumb className={cn('overflow-hidden whitespace-nowrap min-w-0', className)} title={fullPath}>
      <BreadcrumbList className="text-[10px] text-text-tertiary gap-1">
        {ancestors.map((ancestor, index) => (
          <React.Fragment key={ancestor.id || index}>
            <BreadcrumbItem>
              <BreadcrumbLink
                asChild
                className="truncate max-w-[120px] hover:text-text-primary transition-colors cursor-pointer text-left text-text-tertiary"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    if (onClickAncestor) {
                      e.stopPropagation();
                      onClickAncestor(ancestor);
                    }
                  }}
                  title={`${ancestor.identifier}: ${ancestor.title}`}
                >
                  <span className="font-mono text-zinc-500 mr-1">{ancestor.identifier}</span>
                  {ancestor.title}
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-zinc-600 [&>svg]:w-2.5 [&>svg]:h-2.5" />
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
