'use client';

import React, { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface AIMarkdownMessageProps {
  content: string;
  className?: string;
}

// Subcomponent: Code Block with Language Tag and Copy Button
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy code');
    }
  };

  const displayLanguage = language.trim() || 'code';

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-white/[0.08] bg-[#0c0d10] shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#15161b] border-b border-white/[0.06] text-[11px] font-mono text-zinc-400">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-zinc-500" />
          <span className="uppercase tracking-wider text-[10px] text-zinc-300 font-semibold">
            {displayLanguage}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto font-mono text-[11.5px] leading-relaxed text-zinc-200">
        <pre className="m-0 whitespace-pre">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

// Formats inline text: bold, italic, code, links
function renderInlineFormatting(text: string): React.ReactNode[] {
  // Regex pattern matching:
  // 1. Inline code: `code`
  // 2. Bold: **bold** or __bold__
  // 3. Italic: *italic* or _italic_
  // 4. Links: [text](url)
  const tokens = text.split(
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g
  );

  return tokens.map((part, index) => {
    if (!part) return null;

    // Inline code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeContent = part.slice(1, -1);
      return (
        <code
          key={index}
          className="font-mono text-[11px] text-indigo-300 bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.05]"
        >
          {codeContent}
        </code>
      );
    }

    // Bold
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong key={index} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Links: [label](href)
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        const [, label, href] = match;
        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7170ff] hover:underline underline-offset-2 inline-flex items-center gap-0.5 font-medium"
          >
            <span>{label}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0 inline" />
          </a>
        );
      }
    }

    // Italic
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={index} className="italic text-zinc-300">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

// Subcomponent: Markdown Table
function TableBlock({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;

  const parseRow = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow); // skip delimiter row (line 1)

  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0c0d10]">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-[#15161b] border-b border-white/[0.08] text-zinc-300 font-semibold">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-[11px] font-mono">
                {renderInlineFormatting(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04] text-zinc-300">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-white/[0.02] transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-2 text-xs leading-relaxed">
                  {renderInlineFormatting(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AIMarkdownMessage({ content, className = '' }: AIMarkdownMessageProps) {
  if (!content) return null;

  // Split into blocks: code fences vs normal text
  const blocks: React.ReactNode[] = [];
  const lines = content.split('\n');

  let i = 0;
  let keyIndex = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Code block fence (```)
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <CodeBlock
          key={`code-${keyIndex++}`}
          language={language}
          code={codeLines.join('\n')}
        />
      );
      continue;
    }

    // 2. Markdown Table Detection: line starts with | and next line has |---|
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('|') &&
      lines[i + 1].includes('-')
    ) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(<TableBlock key={`table-${keyIndex++}`} lines={tableLines} />);
      continue;
    }

    // 3. Headers
    if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${keyIndex++}`} className="text-base font-semibold text-white mt-4 mb-2 tracking-tight">
          {renderInlineFormatting(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${keyIndex++}`} className="text-sm font-semibold text-white mt-3.5 mb-1.5 tracking-tight">
          {renderInlineFormatting(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${keyIndex++}`} className="text-xs font-semibold text-zinc-100 mt-3 mb-1 uppercase tracking-wider text-[11px]">
          {renderInlineFormatting(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // 4. Horizontal Rule
    if (line.trim() === '---' || line.trim() === '***') {
      blocks.push(<hr key={`hr-${keyIndex++}`} className="my-3 border-white/[0.08]" />);
      i++;
      continue;
    }

    // 5. Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={`quote-${keyIndex++}`}
          className="my-2 border-l-2 border-indigo-500/60 pl-3 py-0.5 text-zinc-400 italic text-xs bg-indigo-500/[0.03] rounded-r"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx} className="my-0.5">
              {renderInlineFormatting(ql)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 6. Bullet Lists (* or -)
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${keyIndex++}`} className="my-2 space-y-1 pl-4 list-disc marker:text-zinc-500 text-xs text-zinc-200">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 7. Numbered Lists (1., 2., etc)
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${keyIndex++}`} className="my-2 space-y-1 pl-4 list-decimal marker:text-zinc-500 text-xs text-zinc-200 font-sans">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 8. Normal text / Paragraph
    if (line.trim() === '') {
      // Empty line spacing
      blocks.push(<div key={`empty-${keyIndex++}`} className="h-1.5" />);
      i++;
      continue;
    }

    // Collect continuous paragraph lines
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].startsWith('# ') &&
      !lines[i].startsWith('## ') &&
      !lines[i].startsWith('### ') &&
      !lines[i].startsWith('> ') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      lines[i].trim() !== '---'
    ) {
      pLines.push(lines[i]);
      i++;
    }

    blocks.push(
      <p key={`p-${keyIndex++}`} className="text-xs leading-relaxed text-zinc-200 my-1 font-sans">
        {pLines.map((pLine, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInlineFormatting(pLine)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return <div className={`space-y-1 text-xs select-text ${className}`}>{blocks}</div>;
}
