/**
 * @related-files:
 * - frontend/components/ai/AIAssistantModal.tsx
 * - frontend/components/navigation/TopNav.tsx
 * - frontend/lib/api.ts
 * - backend/app/api/v1/phase4.py
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles,
  Send,
  Wrench,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  StopCircle,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { User } from '@/types';
import { api } from '@/lib/api';
import { TopNav } from '@/components/navigation/TopNav';
import { supabase } from '@/lib/supabase/client';

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

  const handleNewConversation = () => {
    const newId = `conv_${Date.now()}`;
    setActiveThreadId(newId);
    setMessages([DEFAULT_WELCOME_MSG]);
    router.push(`/${orgSlug}/${teamKey.toLowerCase()}/ai?conversationId=${newId}`);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

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

  const quickPrompts = [
    'How should we architect our caching layer?',
    'Brainstorm ideas for our next sprint',
    'Move ENG-1 to Completed',
  ];

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    const agentMsgId = `agt_${Date.now()}`;
    const initialAgentMsg: Message = {
      id: agentMsgId,
      sender: 'agent',
      content: '',
      tools: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, initialAgentMsg]);

    const orgId = organizationId || '00000000-0000-0000-0000-000000000001';
    const chatHistory = [...messages, userMsg].map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await api.streamChat(
        {
          organization_id: orgId,
          messages: chatHistory,
        },
        ({ type, data }) => {
          if (type === 'tool_start') {
            const toolName = data?.tool || 'tool';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      tools: [
                        ...(m.tools || []).filter((t) => t.name !== toolName),
                        { name: toolName, status: 'running' },
                      ],
                    }
                  : m
              )
            );
          } else if (type === 'tool_complete') {
            const toolName = data?.tool || 'tool';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      tools: (m.tools || []).map((t) =>
                        t.name === toolName
                          ? { ...t, status: 'completed', result: data?.status || 'Done' }
                          : t
                      ),
                    }
                  : m
              )
            );
          } else if (type === 'token') {
            const tokenText = data?.text || '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, content: (m.content || '') + tokenText } : m
              )
            );
          } else if (type === 'interrupt_required') {
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
                        description: data.description || 'Action requires confirmation',
                        status: 'pending',
                      },
                    }
                  : m
              )
            );
          } else if (type === 'done') {
            setIsStreaming(false);
          }
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `Could not complete response: ${err?.message || 'Server error occurred'}.`,
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
                content:
                  (m.content ? m.content + '\n\n' : '') +
                  `✓ Confirmed: ${interrupt.description}. Workspace updated.`,
              }
            : m
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.interrupt
            ? {
                ...m,
                interrupt: {
                  ...m.interrupt,
                  isLoading: false,
                },
                content:
                  (m.content ? m.content + '\n\n' : '') +
                  `Failed to apply action: ${err?.message || 'Database error'}.`,
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
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-black font-sans">
      <TopNav
        title="AI Assistant"
        subtitle="Linear Ask Agent"
        breadcrumbs={['Workspace', teamKey || 'Team', 'AI']}
      />

      {/* Conversation Thread Bar */}
      <div className="px-6 py-2 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 font-mono">Thread:</span>
          <span
            suppressHydrationWarning
            className="text-[11px] font-mono text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800"
          >
            {isMounted ? (activeThreadId || conversationId) : conversationId}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNewConversation}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors cursor-pointer"
          title="Start fresh conversation"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Messages Canvas */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-w-4xl w-full mx-auto">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
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
                        : 'bg-zinc-900 text-zinc-200 border border-zinc-800 whitespace-pre-wrap'
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
                <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 font-semibold text-[11px] text-zinc-200">
                  {currentUser?.name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Tray */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-md max-w-4xl w-full mx-auto">
        {/* Quick Prompts Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              disabled={isStreaming}
              className="text-[11px] text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center mt-1"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask agent to plan, search issues, or execute actions..."
            disabled={isStreaming}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-lg pl-3.5 pr-20 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors"
          />

          <div className="absolute right-2 flex items-center gap-1.5">
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStopStreaming}
                className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Stop streaming"
              >
                <StopCircle className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-1.5 rounded-md bg-white hover:bg-zinc-200 text-black transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
