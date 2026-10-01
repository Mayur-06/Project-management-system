'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('alex@acme.inc');
  const [password, setPassword] = useState('••••••••••••');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      router.push('/acme/eng/issues');
    }, 600);
  };

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm space-y-6 bg-zinc-950 border border-zinc-800 p-8 rounded-xl shadow-2xl animate-fade-in">
        <div className="space-y-2 text-center">
          <div className="w-10 h-10 rounded-lg bg-white text-black flex items-center justify-center mx-auto shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-white">Sign in to Workspace</h1>
          <p className="text-xs text-zinc-400">High-speed project management for modern teams</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Email</label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-medium block mb-1.5">Password</label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded border border-zinc-800 focus:border-white focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="text-center text-xs text-zinc-400">
          <span>Don't have an account? </span>
          <Link href="/signup" className="text-white hover:underline font-medium">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
