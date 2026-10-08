'use client';

import React, { useRef, useState } from 'react';
import { IssueAttachment } from '@/types';
import { Paperclip, Upload, Loader2, Download, FileText, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IssueAttachmentButtonProps {
  attachments: IssueAttachment[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  isUploading?: boolean;
  uploadError?: string | null;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const IssueAttachmentButton: React.FC<IssueAttachmentButtonProps> = ({
  attachments,
  onUpload,
  isUploading = false,
  uploadError = null,
  className,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-text-tertiary hover:text-text-primary hover:bg-white/[0.04] transition-colors cursor-pointer group',
            className
          )}
          title="Attachments"
        >
          <Paperclip className="w-3.5 h-3.5 group-hover:text-text-secondary transition-colors" />
          {attachments.length > 0 && (
            <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-surface-elevated text-text-secondary border border-border-subtle">
              {attachments.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 p-3 bg-[#141517] border border-white/[0.08] shadow-2xl rounded-xl text-zinc-200 z-50 space-y-3"
      >
        <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
          <span className="text-xs font-semibold text-text-primary">
            Attachments {attachments.length > 0 && `(${attachments.length})`}
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-[11px] font-medium text-brand-primary hover:text-accent-hover flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3 h-3" />
            <span>Upload file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => {
              onUpload(e);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="hidden"
          />
        </div>

        {uploadError && (
          <div className="p-2 rounded bg-red-950/50 border border-red-900/60 text-[11px] text-red-300">
            {uploadError}
          </div>
        )}

        {isUploading && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-text-tertiary">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-primary" />
            <span>Uploading attachment...</span>
          </div>
        )}

        {attachments.length === 0 && !isUploading ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="py-6 border border-dashed border-white/[0.08] hover:border-white/[0.16] rounded-lg text-center cursor-pointer transition-colors bg-white/[0.01]"
          >
            <Paperclip className="w-5 h-5 text-text-quaternary mx-auto mb-1.5" />
            <p className="text-xs text-text-secondary font-medium">No attachments yet</p>
            <p className="text-[10px] text-text-quaternary mt-0.5">Click to browse or drop file</p>
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-elevated/60 border border-border-subtle hover:border-white/[0.12] transition-colors group/item"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                  <div className="min-w-0 truncate">
                    <p className="text-xs text-text-primary font-medium truncate">{att.file_name}</p>
                    <p className="text-[10px] text-text-quaternary font-mono">
                      {formatFileSize(att.file_size)}
                    </p>
                  </div>
                </div>

                {att.file_url && (
                  <a
                    href={att.file_url}
                    download={att.file_name}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-white/[0.06] transition-colors shrink-0"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
