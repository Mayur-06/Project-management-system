/**
 * @related-files:
 * - frontend/app/(workspace)/[orgSlug]/settings/layout.tsx
 * - frontend/app/(workspace)/[orgSlug]/settings/workspace/page.tsx
 */

import { redirect } from 'next/navigation';

export default async function SettingsRootPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/settings/workspace`);
}
