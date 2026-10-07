'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface IssueTitleEditorProps {
  initialTitle: string;
  onSave: (newTitle: string) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
}

export const IssueTitleEditor: React.FC<IssueTitleEditorProps> = ({
  initialTitle,
  onSave,
  className = '',
  disabled = false,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  // Auto-resize textarea height to fit content
  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [title]);

  const handleCommit = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === initialTitle.trim()) {
      setTitle(initialTitle);
      return;
    }

    try {
      setIsSaving(true);
      await onSave(trimmed);
    } catch (err) {
      console.error('Failed to update issue title', err);
      setTitle(initialTitle);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textareaRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setTitle(initialTitle);
      textareaRef.current?.blur();
    }
  };

  return (
    <div className="relative group w-full">
      <textarea
        ref={textareaRef}
        rows={1}
        value={title}
        disabled={disabled || isSaving}
        onChange={(e) => {
          setTitle(e.target.value);
          adjustHeight();
        }}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        placeholder="Issue title..."
        className={cn(
          'w-full resize-none overflow-hidden bg-transparent font-semibold text-text-primary text-xl leading-snug rounded px-1 -mx-1 py-0.5 border border-transparent transition-colors',
          'hover:border-border-subtle focus:border-accent-violet/50 focus:bg-white/[0.02] focus:outline-none',
          'placeholder:text-text-quaternary disabled:opacity-50 select-text cursor-text',
          className
        )}
      />
      {isSaving && (
        <span className="absolute right-0 top-1 text-[11px] font-mono text-text-tertiary animate-pulse">
          Saving...
        </span>
      )}
    </div>
  );
};
