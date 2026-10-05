'use client';

import useSWR from 'swr';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FileBrowserPage } from '@/components/pages/file-browser-page';
import type { FileSystemNode } from '@/lib/types';
import { Button, Card, Skeleton } from '@heroui/react';
import { useUser } from '@/lib/auth/client';
import { authFetch } from '@/lib/api-client';
import type { AppUser as User } from '@/lib/auth/types';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';

const AUTH_PENDING_ERROR = 'Authentication pending';

function FilesBrowserContent({ user }: { user: User }) {
  const router = useRouter();
  const { data: fileSystem, error: fetchError, isLoading, mutate } = useSWR<FileSystemNode>(
    ['filesystem', user.id],
    async () => {
      const response = await authFetch('/api/filesystem');
      if (!response.ok) throw new Error('File browser unavailable. Please retry.');
      return (await response.json()).fileSystem as FileSystemNode;
    },
    { errorRetryCount: 3 },
  );
  const error = fetchError instanceof Error ? fetchError.message : null;
  const fetchFileSystem = async () => { await mutate(); };

  if (isLoading) {
    return (
      <div className="relative mx-auto max-w-7xl space-y-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

        <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
          <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-start">
            <div className="space-y-3">
              <Skeleton className="h-7 w-28 rounded-full" />
              <Skeleton className="h-14 w-72 rounded-[1.5rem]" />
              <Skeleton className="h-5 w-full max-w-2xl rounded-full" />
            </div>
            <Skeleton className="h-36 rounded-[1.5rem]" />
          </div>
        </section>

        <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
          <Card.Content className="space-y-4 p-6">
            <Skeleton className="h-12 w-full rounded-[1rem]" />
            <Skeleton className="h-12 w-full rounded-[1rem]" />
            <Skeleton className="h-12 w-full rounded-[1rem]" />
            <Skeleton className="h-12 w-full rounded-[1rem]" />
          </Card.Content>
        </Card>
      </div>
    );
  }

  if (error && error !== AUTH_PENDING_ERROR) {
    return (
      <div className="relative mx-auto max-w-5xl space-y-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_28%)]" />

        <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
          <Card.Content className="space-y-5 p-6 md:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-warning/10 text-warning">
              <TriangleAlert className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-[-0.04em] text-foreground">File browser unavailable</h2>
              <p className="text-base leading-7 text-default-600">
                {error}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="rounded-full px-5 font-semibold" onPress={fetchFileSystem}>
                Retry
              </Button>
              <Button className="rounded-full px-5 font-semibold" onPress={() => router.push('/recordings')}>
                Back to recordings
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  if (!fileSystem) {
    return null;
  }

  return <FileBrowserPage rootNode={fileSystem} onRefresh={fetchFileSystem} />;
}

export default function FilesPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace(buildLoginRedirectHref(pathname));
    }
  }, [isUserLoading, pathname, router, user]);

  // Show loading state while checking auth
  if (isUserLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <Skeleton className="h-14 w-72 rounded-[1.5rem]" />
        <Skeleton className="h-[420px] rounded-[1.9rem]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <Skeleton className="h-14 w-72 rounded-[1.5rem]" />
        <Skeleton className="h-[420px] rounded-[1.9rem]" />
      </div>
    );
  }

  return <FilesBrowserContent user={user} />;
}
