'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles,
  ArrowUp,
  Paperclip,
  Wrench,
  Loader2,
  CheckCircle2,
  ArrowRight,
  StopCircle,
  Plus,
  ChevronDown,
  Edit3,
  Bot,
} from 'lucide-react';
import { User } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { supabase } from '@/lib/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface ActionInterrupt {
  action: string;
  issue_id: string;
  issue_identifier?: string;
  issue_title?: string;
  target_state_id?: string;
  target_state_name?: string;
  target_assignee_id?: string;
  description: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  isLoading?: boolean;
  resultMessage?: string;
}

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  tools?: { name: string; status: 'running' | 'completed'; result?: string }[];
  interrupt?: ActionInterrupt;
  timestamp: string;
}

const DEFAULT_WELCOME_MSG: Message = {
  id: 'msg_welcome',
  sender: 'agent',
  content:
    "I'm your workspace copilot. Ask me anything — architect systems, design APIs, plan sprints, or search and manage workspace issues.",
  timestamp: 'Just now',
};

export default function WorkspaceAIPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const orgSlug = (params?.orgSlug as string) || '';
  const conversationId = searchParams.get('conversationId') || '';

  const parentContext = useWorkspace();
  const [activeThreadId, setActiveThreadId] = useState<string>(conversationId || '');
  const [organizationId, setOrganizationId] = useState<string>(parentContext.organization?.id || '');

  const [messages, setMessages] = useState<Message[]>([DEFAULT_WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize or sync thread ID
  useEffect(() => {
    if (!activeThreadId) {
      setActiveThreadId(conversationId || `conv_${Date.now()}`);
    }
  }, [conversationId, activeThreadId]);

  useEffect(() => {
    if (conversationId && conversationId !== activeThreadId) {
      setActiveThreadId(conversationId);
    }
  }, [conversationId]);

  // Resolve organization id
  useEffect(() => {
    if (parentContext.organization?.id) {
      setOrganizationId(parentContext.organization.id);
    } else if (orgSlug) {
      api.getWorkspace(orgSlug).then((org) => {
        if (org?.id) setOrganizationId(org.id);
      }).catch(() => {});
    }
  }, [orgSlug, parentContext.organization]);

  // Load thread history
  useEffect(() => {
    if (typeof window === 'undefined' || !activeThreadId) return;
    try {
      const stored = localStorage.getItem(`ai_thread_${activeThreadId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {}
    setMessages([DEFAULT_WELCOME_MSG]);
  }, [activeThreadId]);

  // Persist thread history
  useEffect(() => {
    if (typeof window === 'undefined' || !activeThreadId) return;
    if (messages.length > 1 || (messages.length === 1 && messages[0].id !== 'msg_welcome')) {
      try {
        localStorage.setItem(`ai_thread_${activeThreadId}`, JSON.stringify(messages));
      } catch {}
    }
  }, [messages, activeThreadId]);

  const hasStarted = useMemo(() => {
    return messages.some((m) => m.sender === 'user');
  }, [messages]);

  const handleNewConversation = () => {
    const newId = `conv_${Date.now()}`;
    setActiveThreadId(newId);
    setMessages([DEFAULT_WELCOME_MSG]);
    router.push(`/${orgSlug}/ai?conversationId=${newId}`);
  };

  useEffect(() => {
    if (hasStarted) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, hasStarted]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: 'Just now',
    };

    const agentMsgId = `agent_${Date.now()}`;
    const initialAgentMsg: Message = {
      id: agentMsgId,
      sender: 'agent',
      content: '',
      tools: [],
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg, initialAgentMsg]);
    setInput('');
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const orgId = organizationId || parentContext.organization?.id || '';
      const historyPayload = messages
        .filter((m) => m.id !== 'msg_welcome' && m.content)
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));
      historyPayload.push({ role: 'user', content: text });

      await api.streamChat(
        {
          organization_id: orgId,
          messages: historyPayload,
        },
        (event) => {
          if (event.type === 'token') {
            const tok = typeof event.data === 'object' ? event.data?.text : event.data;
            if (tok) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId ? { ...m, content: m.content + tok } : m
                )
              );
            }
          } else if (event.type === 'tool_start') {
            const toolName = event.data?.tool || 'workspace_tool';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      tools: [
                        ...(m.tools || []),
                        { name: toolName, status: 'running' },
                      ],
                    }
                  : m
              )
            );
          } else if (event.type === 'tool_complete') {
            const toolName = event.data?.tool || 'workspace_tool';
            const count = event.data?.results_count;
            const statusText = count !== undefined ? `${count} found` : 'Executed';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      tools: (m.tools || []).map((t) =>
                        t.name === toolName
                          ? { ...t, status: 'completed', result: statusText }
                          : t
                      ),
                    }
                  : m
              )
            );
          } else if (event.type === 'interrupt_required') {
            const data = event.data;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      interrupt: {
                        action: data.action || 'update_issue_status',
                        issue_id: data.issue_id,
                        issue_identifier: data.issue_identifier,
                        issue_title: data.issue_title,
                        target_state_id: data.target_state_id,
                        target_state_name: data.target_state_name,
                        target_assignee_id: data.target_assignee_id,
                        description:
                          data.description ||
                          `Confirm action on ${data.issue_identifier || 'issue'}`,
                        status: 'pending',
                      },
                    }
                  : m
              )
            );
          }
        },
        abortController.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Agent chat error:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId
              ? {
                  ...m,
                  content:
                    m.content ||
                    'Sorry, I encountered an issue connecting to the workspace copilot. Please try again.',
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleConfirmInterrupt = async (msgId: string, interrupt: ActionInterrupt) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.interrupt
          ? { ...m, interrupt: { ...m.interrupt, isLoading: true } }
          : m
      )
    );

    try {
      const res = await api.confirmChatAction({
        action: interrupt.action,
        issue_id: interrupt.issue_id,
        target_state_id: interrupt.target_state_id,
        target_assignee_id: interrupt.target_assignee_id,
      });

      const messageText = res?.message || 'Action executed successfully.';
      toast.success(messageText);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.interrupt
            ? {
                ...m,
                interrupt: {
                  ...m.interrupt,
                  status: 'confirmed',
                  isLoading: false,
                  resultMessage: messageText,
                },
              }
            : m
        )
      );
    } catch (err: any) {
      console.error('Failed to confirm action:', err);
      toast.error(err?.message || 'Failed to confirm action');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.interrupt
            ? {
                ...m,
                interrupt: {
                  ...m.interrupt,
                  isLoading: false,
                  resultMessage: 'Error applying action.',
                },
              }
            : m
        )
      );
    }
  };

  const handleCancelInterrupt = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.interrupt
          ? {
              ...m,
              interrupt: { ...m.interrupt, status: 'cancelled' },
              content:
                (m.content ? m.content + '\n\n' : '') +
                'Action canceled. No changes were made.',
            }
          : m
      )
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-[#08090a] font-sans relative">
      {/* Top Header Bar */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/[0.04] bg-[#08090a] shrink-0 z-20">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <span>New chat</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-[#141517] border border-white/[0.08] text-white p-1">
              <DropdownMenuItem onClick={handleNewConversation} className="text-xs cursor-pointer">
                <Plus className="w-3.5 h-3.5 mr-2" />
                <span>Start New Chat</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={handleNewConversation}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors cursor-pointer"
            title="New Chat"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {hasStarted && (
            <span className="text-[11px] font-mono text-zinc-500 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.04]">
              {activeThreadId}
            </span>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          STATE 1: INITIAL CENTERED MINIMALIST LANDING (when !hasStarted)
          Pure minimalist centered input with subtle background watermark
          ──────────────────────────────────────────────────────────────────────── */}
      {!hasStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
          {/* Subtle geometric watermark in center background */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
            <svg width="420" height="420" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="80" stroke="white" strokeWidth="1.5" strokeDasharray="6 6" />
              <circle cx="100" cy="100" r="45" stroke="white" strokeWidth="1" strokeDasharray="3 3" />
              <path d="M40 100 Q100 20 160 100 Q100 180 40 100" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="w-full max-w-xl flex flex-col relative z-20">
            {/* Centered Query Input Card */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="rounded-xl bg-[#121316] border border-white/[0.08] shadow-2xl p-3 flex flex-col gap-2 transition-all focus-within:border-white/[0.16]"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask workspace copilot..."
                rows={2}
                className="w-full bg-transparent resize-none outline-none border-none text-sm text-zinc-100 placeholder-zinc-500 leading-relaxed font-sans"
              />

              {/* Action bar inside card */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.03]">
                <button
                  type="button"
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  title="Attach file"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="w-7 h-7 rounded-full bg-[#5e6ad2] hover:bg-[#7170ff] text-white flex items-center justify-center transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Send message"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Right Copilot indicator */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs text-zinc-500 font-sans select-none">
            <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
            <span>Copilot</span>
          </div>
        </div>
      ) : (
        /* ────────────────────────────────────────────────────────────────────────
           STATE 2: ACTIVE CONVERSATION STREAM + BOTTOM QUERY TRAY
           ──────────────────────────────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Messages Canvas */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 max-w-3xl w-full mx-auto">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 text-xs leading-relaxed ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Tool execution indicators */}
                    {msg.tools && msg.tools.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {msg.tools.map((tool, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 font-mono"
                          >
                            <Wrench className="w-3 h-3 text-zinc-400" />
                            <span>tool: {tool.name}</span>
                            {tool.status === 'running' ? (
                              <Loader2 className="w-3 h-3 text-white animate-spin" />
                            ) : (
                              <span className="text-emerald-400 text-[10px]">✓ {tool.result || 'Executed'}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message Bubble */}
                    {msg.content && (
                      <div
                        className={`px-4 py-2.5 rounded-lg text-xs leading-relaxed ${
                          isUser
                            ? 'bg-[#1b1c20] text-zinc-100 border border-white/[0.08]'
                            : 'bg-[#121316] text-zinc-200 border border-white/[0.06]'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    )}

                    {/* Human-in-the-Loop Interrupt Gate Card */}
                    {msg.interrupt && (
                      <div className="mt-3 p-3.5 rounded-lg border border-amber-500/30 bg-amber-950/20 w-full space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                            Action Proposed
                          </span>
                          <span className="text-[11px] text-zinc-400 font-mono">
                            {msg.interrupt.action}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-300">
                          {msg.interrupt.description}
                        </p>

                        {msg.interrupt.issue_identifier && (
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.06] font-mono text-zinc-300">
                              {msg.interrupt.issue_identifier}
                            </span>
                            {msg.interrupt.target_state_name && (
                              <>
                                <ArrowRight className="w-3 h-3 text-zinc-500" />
                                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-200">
                                  {msg.interrupt.target_state_name}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        {msg.interrupt.status === 'pending' ? (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleConfirmInterrupt(msg.id, msg.interrupt!)}
                              disabled={msg.interrupt.isLoading}
                              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {msg.interrupt.isLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                              Confirm & Execute
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelInterrupt(msg.id)}
                              disabled={msg.interrupt.isLoading}
                              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : msg.interrupt.status === 'confirmed' ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400 pt-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{msg.interrupt.resultMessage || 'Action executed successfully.'}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-500 pt-1">
                            Action cancelled.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Query Bar */}
          <div className="p-4 bg-[#08090a] border-t border-white/[0.04] shrink-0">
            <div className="max-w-3xl mx-auto flex items-center gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex-1 flex items-center gap-2 bg-[#121316] border border-white/[0.08] rounded-xl px-3 py-2 transition-all focus-within:border-white/[0.16]"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask workspace copilot..."
                  rows={1}
                  className="flex-1 bg-transparent resize-none outline-none border-none text-xs text-zinc-100 placeholder-zinc-500 leading-relaxed font-sans"
                />

                <button
                  type="button"
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  title="Attach file"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStopStreaming}
                    className="p-1 rounded text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                    title="Stop streaming"
                  >
                    <StopCircle className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="w-6 h-6 rounded-full bg-[#5e6ad2] hover:bg-[#7170ff] text-white flex items-center justify-center transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Send message"
                  >
                    <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
