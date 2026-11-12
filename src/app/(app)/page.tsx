import { redirect } from 'next/navigation';
import { workspaceHomeHref } from '@/lib/public-site-policy';

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(workspaceHomeHref(await searchParams));
}
