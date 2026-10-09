'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ImageExtension from '@tiptap/extension-image';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Check,
  Loader2,
  ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface IssueDescriptionEditorProps {
  issueId: string;
  initialText?: string;
  initialJson?: any;
  onSave: (data: { description_text: string; description_json: any }) => Promise<void> | void;
  className?: string;
  editable?: boolean;
}

export const IssueDescriptionEditor: React.FC<IssueDescriptionEditorProps> = ({
  issueId,
  initialText = '',
  initialJson = null,
  onSave,
  className = '',
  editable = true,
}) => {
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger auto-save
  const triggerSave = useCallback(
    async (editorInstance: any) => {
      if (!editorInstance) return;
      const text = editorInstance.getText();
      const json = editorInstance.getJSON();

      setSaveStatus('saving');
      try {
        await onSave({ description_text: text, description_json: json });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to save description:', err);
        setSaveStatus('unsaved');
      }
    },
    [onSave]
  );

  // Helper to upload image and insert into TipTap editor
  const handleUploadImage = useCallback(
    async (file: File, editorInstance: any) => {
      if (!issueId) {
        toast.error('Cannot upload image: Missing issue ID');
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        toast.error('Image exceeds 50MB size limit');
        return;
      }

      const toastId = toast.loading(`Uploading ${file.name}...`);
      setIsUploadingImage(true);

      try {
        const uploadTicket = await api.getUploadUrl(
          issueId,
          file.name,
          file.size,
          file.type || 'image/png'
        );

        if (!uploadTicket?.upload_url) {
          throw new Error('Could not obtain upload URL');
        }

        // Upload binary to Supabase Storage signed upload URL
        // Supabase signed upload endpoint accepts multipart/form-data
        let uploadOk = false;
        try {
          const formData = new FormData();
          formData.append('cacheControl', '3600');
          formData.append('', file);

          const uploadRes = await fetch(uploadTicket.upload_url, {
            method: 'PUT',
            body: formData,
          });
          uploadOk = uploadRes.ok;
          if (!uploadOk) {
            console.warn('FormData upload status:', uploadRes.status);
          }
        } catch (fdErr) {
          console.warn('FormData upload error:', fdErr);
        }

        if (!uploadOk) {
          const uploadResRaw = await fetch(uploadTicket.upload_url, {
            method: 'PUT',
            headers: {
              'Content-Type': file.type || 'image/png',
            },
            body: file,
          });
          uploadOk = uploadResRaw.ok;
          if (!uploadOk) {
            const errDetail = await uploadResRaw.text().catch(() => '');
            throw new Error(`Storage upload failed with status ${uploadResRaw.status} ${errDetail}`);
          }
        }

        // Use persistent public URL
        const baseStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zteuxlfrleyctdkyuzvb.supabase.co';
        const imageUrl =
          uploadTicket.file_url ||
          `${baseStorageUrl}/storage/v1/object/public/attachments/${uploadTicket.storage_path}`;

        editorInstance
          ?.chain()
          .focus()
          .setImage({ src: imageUrl, alt: file.name })
          .run();

        // Immediately auto-save so image persists in description across reloads
        triggerSave(editorInstance);
        toast.success('Image uploaded successfully', { id: toastId });
      } catch (err: any) {
        console.error('Image upload error:', err);
        // Fallback: Read as base64 Data URL so the screenshot preview is persistently preserved in description JSON/text
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          if (dataUrl) {
            editorInstance
              ?.chain()
              .focus()
              .setImage({ src: dataUrl, alt: file.name })
              .run();
            triggerSave(editorInstance);
            toast.warning('Image embedded into description', { id: toastId });
          }
        };
        reader.onerror = () => {
          toast.error('Failed to process image', { id: toastId });
        };
        reader.readAsDataURL(file);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [issueId, triggerSave]
  );

  const initialContent = React.useMemo(() => {
    if (initialJson && typeof initialJson === 'object') {
      return initialJson;
    }
    if (initialText) {
      return `<p>${initialText.replace(/\n/g, '<br>')}</p>`;
    }
    return '';
  }, [initialJson, initialText]);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'bg-black/60 border border-border-subtle p-2.5 rounded-md font-mono text-xs my-2 text-zinc-300' } },
        bulletList: { HTMLAttributes: { class: 'list-disc ml-4 space-y-0.5 my-1.5' } },
        orderedList: { HTMLAttributes: { class: 'list-decimal ml-4 space-y-0.5 my-1.5' } },
        blockquote: { HTMLAttributes: { class: 'border-l-2 border-brand-primary/80 pl-3 my-2 text-text-tertiary italic' } },
      }),
      Placeholder.configure({
        placeholder: 'Add description... (Use **bold**, *italic*, # headings, or paste images)',
      }),
      ImageExtension.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-md border border-border-subtle max-h-96 my-2 object-contain hover:border-brand-primary/50 transition-colors',
        },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: cn(
          'min-h-[100px] w-full text-xs text-text-secondary leading-relaxed focus:outline-none select-text cursor-text',
          '[&_.is-editor-empty:first-child::before]:text-text-quaternary [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:pointer-events-none'
        ),
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              handleUploadImage(file, editor);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      setSaveStatus('unsaved');
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        triggerSave(activeEditor);
      }, 800);
    },
    onBlur: ({ editor: activeEditor }) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      triggerSave(activeEditor);
    },
  });

  // Sync content if issue updates externally
  useEffect(() => {
    if (editor && !editor.isFocused) {
      if (initialJson && typeof initialJson === 'object') {
        const currentJSON = JSON.stringify(editor.getJSON());
        const incomingJSON = JSON.stringify(initialJson);
        if (currentJSON !== incomingJSON) {
          editor.commands.setContent(initialJson);
        }
      } else if (initialText && editor.getText().trim() !== initialText.trim()) {
        editor.commands.setContent(`<p>${initialText.replace(/\n/g, '<br>')}</p>`);
      }
    }
  }, [initialJson, initialText, editor]);

  return (
    <div className={cn('relative flex flex-col rounded-md border border-border-subtle bg-surface-elevated/40 p-3 transition-colors focus-within:border-accent-violet/40 focus-within:bg-surface-elevated/60', className)}>
      {/* Floating Bubble Menu on text selection */}
      {editor && editable && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-md bg-[#141517] border border-border-standard p-1 shadow-xl text-text-secondary"
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('bold') && 'bg-brand-primary text-white')}
            title="Bold (Cmd+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('italic') && 'bg-brand-primary text-white')}
            title="Italic (Cmd+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('strike') && 'bg-brand-primary text-white')}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('code') && 'bg-brand-primary text-white')}
            title="Inline Code"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <div className="h-3 w-px bg-border-divider mx-0.5" />
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('heading', { level: 2 }) && 'bg-brand-primary text-white')}
            title="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('bulletList') && 'bg-brand-primary text-white')}
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('orderedList') && 'bg-brand-primary text-white')}
            title="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn('p-1 rounded hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer', editor.isActive('blockquote') && 'bg-brand-primary text-white')}
            title="Quote"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
        </BubbleMenu>
      )}

      {/* Editor Main Content */}
      <EditorContent editor={editor} />

      {/* Footer Status Bar: Autosave Feedback & Upload Indicator */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-border-divider text-[10px] text-text-quaternary select-none">
        <div className="flex items-center gap-2">
          {isUploadingImage && (
            <span className="flex items-center gap-1 text-accent-violet animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Uploading image...</span>
            </span>
          )}
          {!isUploadingImage && (
            <span className="flex items-center gap-1 hover:text-text-tertiary transition-colors">
              <ImageIcon className="w-3 h-3 text-text-quaternary" />
              <span>Paste image to embed</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 font-mono">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-accent-violet">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Saving...</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-emerald-400/80">
              <Check className="w-2.5 h-2.5" />
              <span>Saved</span>
            </span>
          )}
          {saveStatus === 'unsaved' && (
            <span className="text-text-tertiary">• Unsaved changes</span>
          )}
        </div>
      </div>
    </div>
  );
};
