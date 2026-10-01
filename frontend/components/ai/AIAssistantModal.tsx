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
} from 'lucide-react';
import { User } from '@/types';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  tools?: { name: string; status: 'running' | 'completed' | 'hitl'; result?: string }[];
  timestamp: string;
}

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose, currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_welcome',
      sender: 'agent',
      content:
        'AI workspace agent initialized. Query issues, inspect active cycles, or request task decompositions.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (!isOpen) return null;

  const quickPrompts = [
    'Summarize current cycle velocity',
    'Find potential duplicate issues',
    'What tasks are currently in review?',
  ];

  const handleSend = (textToSend?: string) => {
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
      tools: [{ name: 'search_issues', status: 'running' }],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, initialAgentMsg]);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                tools: [{ name: 'search_issues', status: 'completed', result: 'Search completed' }],
                content: `Processed query: "${text}". Tasks are tracking on schedule with full velocity.`,
              }
            : m
        )
      );
      setIsStreaming(false);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="w-full max-w-2xl h-[620px] bg-black border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <span>AI Assistant</span>
                <span className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700 font-mono">
                  Agent
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">Workspace intelligence assistant</div>
            </div>
          </div>

          <button
            onClick={onClose}
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
                            <span className="text-white text-[10px]">✓ {tool.result}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`px-4 py-2.5 rounded-lg text-xs leading-relaxed ${
                      isUser
                        ? 'bg-white text-black font-medium'
                        : 'bg-zinc-900 text-zinc-200 border border-zinc-800 whitespace-pre-wrap'
                    }`}
                  >
                    {msg.content || (isStreaming && <Loader2 className="w-4 h-4 text-white animate-spin" />)}
                  </div>

                  <span className="text-[10px] text-zinc-500 mt-1 px-1">{msg.timestamp}</span>
                </div>

                {isUser && (
                  currentUser?.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={currentUser.name}
                      className="w-7 h-7 rounded-full ring-1 ring-zinc-700 object-cover shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0 mt-0.5">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  )
                )}
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
            placeholder="Ask anything or command the workspace agent..."
            className="flex-1 bg-zinc-900 text-xs text-white placeholder-zinc-500 px-3.5 py-2 rounded border border-zinc-800 focus:border-white focus:outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded bg-white hover:bg-zinc-200 disabled:opacity-30 text-black flex items-center justify-center transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
