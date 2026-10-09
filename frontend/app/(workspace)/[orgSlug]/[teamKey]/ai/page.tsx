'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function TeamAIRedirect() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const conversationId = searchParams.get('conversationId');

  useEffect(() => {
    if (orgSlug) {
      const target = conversationId
        ? `/${orgSlug}/ai?conversationId=${encodeURIComponent(conversationId)}`
        : `/${orgSlug}/ai`;
      router.replace(target);
    }
  }, [orgSlug, conversationId, router]);

  return (
    <div className="flex-1 flex items-center justify-center bg-[#08090a] text-xs text-zinc-500 font-sans">
      Redirecting to workspace copilot...
    </div>
  );
}
