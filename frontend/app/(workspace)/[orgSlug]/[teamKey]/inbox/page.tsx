'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function LegacyTeamInboxRedirect() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';

  useEffect(() => {
    if (orgSlug) {
      router.replace(`/${orgSlug}/inbox`);
    }
  }, [orgSlug, router]);

  return null;
}