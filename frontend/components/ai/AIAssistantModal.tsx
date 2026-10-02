'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  X,
  Bot,
  User as UserIcon,
  Wrench,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Square,
  ArrowRight,
} from 'lucide-react';
import { User } from '@/types';
import { api } from '@/lib/api';

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

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
  organizationId?: string;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  organizationId,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_welcome',
      sender: 'agent',
      content:
        "I'm your workspace engineering copilot. Ask me anything — architect systems, design APIs, plan sprints, brainstorm features, or inspect workspace velocity and manage issues.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Clean up stream on unmount or close
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    onClose();
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  if (!isOpen) return null;

  const quickPrompts = [
    'How should we architect our caching layer?',
    'Brainstorm ideas for our next sprint',
    'Summarize current cycle velocity',
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
    // Set loading on interrupt card
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
                  resultMessage: `Failed: ${err?.message || 'Action error'}`,
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
                `Action declined. No changes were made to workspace.`,
            }
          : m
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="w-full max-w-2xl h-[620px] bg-black border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Linear Ask Assistant</span>
                <span className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700 font-mono">
                  Cmd+J
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">ReAct workspace agent with tool execution & HITL safeguards</div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-7 h-7 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center text-xs shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
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

                  {/* Human-in-the-Loop Interrupt Card (Problem Set 7) */}
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

                {isUser &&
                  (currentUser?.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={currentUser.name}
                      className="w-7 h-7 rounded-full ring-1 ring-zinc-700 object-cover shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0 mt-0.5">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  ))}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts */}
        {messages.length <= 2 && (
          <div className="px-5 pb-2 flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                className="px-2.5 py-1 rounded text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything (e.g. system design, sprint strategy, or 'Move ENG-1 to Done')..."
            className="flex-1 bg-zinc-900 text-xs text-white placeholder-zinc-500 px-3.5 py-2 rounded border border-zinc-800 focus:border-white focus:outline-none"
          />
          {isStreaming ? (
            <button
              onClick={handleStopStreaming}
              title="Stop Generating"
              className="w-8 h-8 rounded bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-colors cursor-pointer border border-zinc-700"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="w-8 h-8 rounded bg-white hover:bg-zinc-200 disabled:opacity-30 text-black flex items-center justify-center transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
