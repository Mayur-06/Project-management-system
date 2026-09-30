import { redirect } from 'next/navigation';

export default async function TeamRootPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamKey: string }>;
}) {
  const { orgSlug, teamKey } = await params;
  redirect(`/${orgSlug}/${teamKey}/issues`);
}
