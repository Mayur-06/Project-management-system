'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Lock, Mail, User } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      router.push('/acme/eng/issues');
    }, 600);
  };

  return (
    <div className="min-h-screen w-full bg-[#08090a] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm space-y-6 bg-[#0f1013] border border-[#20232a] p-8 rounded-2xl shadow-2xl animate-fade-in">
        <div className="space-y-2 text-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center mx-auto text-white shadow-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100">Create your workspace</h1>
          <p className="text-xs text-zinc-400">Join Acme Corp on Linear System</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1.5">Full Name</label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#14161b] text-xs text-zinc-100 pl-9 pr-3 py-2.5 rounded-xl border border-[#242730] focus:border-indigo-500 focus:outline-none"
                placeholder="Alex Rivera"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1.5">Work Email</label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#14161b] text-xs text-zinc-100 pl-9 pr-3 py-2.5 rounded-xl border border-[#242730] focus:border-indigo-500 focus:outline-none"
                placeholder="alex@acme.inc"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1.5">Password</label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#14161b] text-xs text-zinc-100 pl-9 pr-3 py-2.5 rounded-xl border border-[#242730] focus:border-indigo-500 focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{loading ? 'Creating workspace...' : 'Get Started'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="text-center text-xs text-zinc-500">
          <span>Already have an account? </span>
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
