/**
 * @related-files:
 * - frontend/components/ai/AIAssistantModal.tsx
 * - frontend/components/navigation/TopNav.tsx
 * - frontend/lib/api.ts
 * - backend/app/api/v1/phase4.py
 */

'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles,
  ArrowUp,
  Paperclip,
  Wrench,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  StopCircle,
  Plus,
  ChevronDown,
  Edit3,
  Bot,
  History,
} from 'lucide-react';
import { User } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { supabase } from '@/lib/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  tools?: { name: string; status: 'running' | 'completed' | 'hitl'; result?: string }[];
  interrupt?: ActionInterrupt;
  timestamp: string;
}

const DEFAULT_WELCOME_MSG: Message = {
  id: 'msg_welcome',
  sender: 'agent',
  content:
    "I'm your workspace engineering copilot. Ask me anything — architect systems, design APIs, plan sprints, brainstorm features, or inspect workspace velocity and manage issues.",
  timestamp: 'Just now',
};

const SUGGESTED_PROMPTS = [
  { text: 'Explore Available Creation and Access Options', time: '9d', hasBullet: true },
  { text: 'Research a Topic', time: '9d', hasBullet: true },
  { text: 'Explain Assistant Capabilities', time: '9d', hasBullet: false },
];

export default function AIPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toUpperCase() || '';
  const conversationId = searchParams.get('conversationId') || '';

  const [activeThreadId, setActiveThreadId] = useState<string>(conversationId || '');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (!activeThreadId) {
      setActiveThreadId(conversationId || `conv_${Date.now()}`);
    }
  }, [conversationId, activeThreadId]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [organizationId, setOrganizationId] = useState<string>('');

  const [messages, setMessages] = useState<Message[]>([DEFAULT_WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Resolve organization
    api.getWorkspace(orgSlug).then((org) => {
      if (org?.id) setOrganizationId(org.id);
    }).catch(() => {});

    // Resolve user session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (user) {
        setCurrentUser({
          id: user.id,
          email: user.email || 'user@example.com',
          name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Member',
          avatar_url: (user.user_metadata?.avatar_url as string) || undefined,
        });
      }
    });
  }, [orgSlug]);

  // Sync activeThreadId from URL query param when changed
  useEffect(() => {
    if (conversationId && conversationId !== activeThreadId) {
      setActiveThreadId(conversationId);
    }
  }, [conversationId]);

  // Load conversation history from localStorage for active thread
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

  // Persist messages to localStorage when updated
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
    router.push(`/${orgSlug}/${teamKey.toLowerCase()}/ai?conversationId=${newId}`);
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
      const response = await fetch('/api/v1/phase4/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Team-Key': teamKey,
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({
          message: text,
          conversation_id: activeThreadId,
          org_slug: orgSlug,
          team_key: teamKey,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No readable stream available in response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'token') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
                    ? { ...m, content: m.content + (data.content || '') }
                    : m
                )
              );
            } else if (data.type === 'tool_start') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
                    ? {
                        ...m,
                        tools: [
                          ...(m.tools || []),
                          { name: data.tool || 'tool', status: 'running' },
                        ],
                      }
                    : m
                )
              );
            } else if (data.type === 'tool_end') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
                    ? {
                        ...m,
                        tools: (m.tools || []).map((t) =>
                          t.name === data.tool
                            ? { ...t, status: 'completed', result: data.output }
                            : t
                        ),
                      }
                    : m
                )
              );
            } else if (data.type === 'interrupt') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
                    ? {
                        ...m,
                        interrupt: {
                          action: data.action || 'update_issue',
                          issue_id: data.issue_id,
                          issue_identifier: data.issue_identifier,
                          issue_title: data.issue_title,
                          target_state_id: data.target_state_id,
                          target_state_name: data.target_state_name,
                          target_assignee_id: data.target_assignee_id,
                          description:
                            data.description ||
                            `Please confirm action on issue ${data.issue_identifier || data.issue_id}`,
                          status: 'pending',
                        },
                      }
                    : m
                )
              );
            }
          } catch {
            // Ignore non-json lines
          }
        }
      }
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
                    'Sorry, I encountered an error connecting to the AI agent service. Please try again.',
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
                'Action canceled by user. No modifications were made.',
            }
          : m
      )
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-[#08090a] font-sans relative">
      {/* Top Bar matching Image 2 */}
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
          STATE 1: INITIAL CENTERED LANDING MATCHING IMAGE 2 (when !hasStarted)
          ──────────────────────────────────────────────────────────────────────── */}
      {!hasStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
          {/* Subtle geometric watermark in center background */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
            <svg width="400" height="400" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="80" stroke="white" strokeWidth="2" strokeDasharray="6 6" />
              <path d="M40 100 Q100 20 160 100 Q100 180 40 100" stroke="white" strokeWidth="2" />
            </svg>
          </div>

          <div className="w-full max-w-xl flex flex-col relative z-20">
            {/* Centered Query Input Card */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="rounded-xl bg-[#121316] border border-white/[0.08] shadow-2xl p-3 flex flex-col gap-2 transition-all focus-within:border-white/[0.14]"
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
                placeholder="Ask Linear..."
                rows={2}
                className="w-full bg-transparent resize-none outline-none border-none text-sm text-zinc-100 placeholder-zinc-500 leading-relaxed font-sans"
              />

              {/* Action rail inside card: paperclip on right + purple round submit button */}
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
                  className="w-7 h-7 rounded-full bg-[#5e6ad2] hover:bg-[#7170ff] text-white flex items-center justify-center transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Send message"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </form>

            {/* Suggested Prompts List Matching Image 2 */}
            <div className="mt-4 space-y-2 px-1">
              {SUGGESTED_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(item.text)}
                  className="w-full flex items-center justify-between py-1 px-1.5 rounded hover:bg-white/[0.03] transition-colors text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {item.hasBullet ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-transparent shrink-0" />
                    )}
                    <span className="text-xs text-zinc-300 group-hover:text-white font-medium transition-colors">
                      {item.text}
                    </span>
                  </div>
                  <span className="text-[11px] font-sans text-zinc-600 shrink-0">
                    {item.time}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Right Agent indicator Matching Image 2 */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs text-zinc-500 font-sans select-none">
            <Bot className="w-3.5 h-3.5 text-zinc-500" />
            <span>Agent</span>
            <History className="w-3.5 h-3.5 text-zinc-600 ml-1" />
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
                            ? 'bg-white text-black font-medium'
                            : 'bg-[#141517] text-zinc-200 border border-white/[0.06] whitespace-pre-wrap'
                        }`}
                      >
                        {msg.content}
                      </div>
                    )}

                    {/* Human-in-the-Loop Interrupt Card */}
                    {msg.interrupt && (
                      <div className="mt-2.5 w-full p-3.5 rounded-lg bg-zinc-950 border border-amber-900/60 shadow-lg space-y-2.5 animate-fade-in">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-white">
                              Action Confirmation Required
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {msg.interrupt.description}
                            </div>
                            {msg.interrupt.issue_title && (
                              <div className="text-[11px] text-zinc-500 truncate mt-0.5 font-mono">
                                Issue: {msg.interrupt.issue_identifier} • {msg.interrupt.issue_title}
                              </div>
                            )}
                          </div>
                        </div>

                        {msg.interrupt.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/80">
                            <button
                              onClick={() => handleCancelInterrupt(msg.id)}
                              disabled={msg.interrupt?.isLoading}
                              className="px-2.5 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800 transition-colors cursor-pointer"
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => handleConfirmInterrupt(msg.id, msg.interrupt!)}
                              disabled={msg.interrupt?.isLoading}
                              className="px-3 py-1 rounded text-[11px] font-semibold text-black bg-white hover:bg-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                            >
                              {msg.interrupt?.isLoading ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Applying...</span>
                                </>
                              ) : (
                                <>
                                  <span>Confirm Action</span>
                                  <ArrowRight className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {msg.interrupt.status === 'confirmed' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Action approved and committed to database</span>
                          </div>
                        )}

                        {msg.interrupt.status === 'cancelled' && (
                          <div className="text-[11px] text-zinc-500 font-medium">
                            Action was canceled by user.
                          </div>
                        )}
                      </div>
                    )}

                    <span className="text-[10px] text-zinc-500 mt-1 px-1">{msg.timestamp}</span>
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 font-semibold text-[11px] text-zinc-200">
                      {currentUser?.name?.charAt(0) || 'U'}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Query Input Tray */}
          <div className="p-4 border-t border-white/[0.04] bg-[#08090a]/90 backdrop-blur-md max-w-3xl w-full mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="rounded-xl bg-[#121316] border border-white/[0.08] shadow-lg p-2.5 flex flex-col gap-1.5 transition-all focus-within:border-white/[0.14]"
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
                placeholder="Ask Linear..."
                rows={1}
                disabled={isStreaming}
                className="w-full bg-transparent resize-none outline-none border-none text-xs text-zinc-100 placeholder-zinc-500 leading-relaxed font-sans"
              />

              <div className="flex items-center justify-end gap-2">
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
                    className="w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                    title="Stop streaming"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="w-6 h-6 rounded-full bg-[#5e6ad2] hover:bg-[#7170ff] text-white flex items-center justify-center transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Send message"
                  >
                    <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
