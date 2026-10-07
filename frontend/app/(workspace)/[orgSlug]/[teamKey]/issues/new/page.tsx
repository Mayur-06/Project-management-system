'use client';

import React, { useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

function RedirectContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const teamKey = (params?.teamKey as string)?.toLowerCase() || '';

  useEffect(() => {
    const query = searchParams.toString();
    const destination = `/${orgSlug}/${teamKey}/issues?create=true${query ? `&${query}` : ''}`;
    router.replace(destination);
  }, [orgSlug, teamKey, searchParams, router]);

  return (
    <div className="flex items-center justify-center h-full text-xs text-zinc-500">
      Opening task creator...
    </div>
  );
}

export default function CreateIssueRedirectPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-xs text-zinc-500">Loading...</div>}>
      <RedirectContent />
    </Suspense>
  );
}
