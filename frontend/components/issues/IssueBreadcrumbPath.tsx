'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Issue } from '@/types';

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
    <div
      className={`flex items-center gap-1 text-[10px] text-zinc-400 font-medium overflow-hidden whitespace-nowrap min-w-0 ${className}`}
      title={fullPath}
    >
      {ancestors.map((ancestor, index) => (
        <React.Fragment key={ancestor.id || index}>
          <button
            type="button"
            onClick={(e) => {
              if (onClickAncestor) {
                e.stopPropagation();
                onClickAncestor(ancestor);
              }
            }}
            className="truncate max-w-[110px] hover:text-zinc-200 transition-colors cursor-pointer text-left focus:outline-hidden"
            title={`${ancestor.identifier}: ${ancestor.title}`}
          >
            {ancestor.title}
          </button>
          <ChevronRight className="w-2.5 h-2.5 text-zinc-600 shrink-0 stroke-[2.5]" />
        </React.Fragment>
      ))}
    </div>
  );
};
