'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FileBrowserPage } from '@/components/pages/file-browser-page';
import type { FileSystemNode } from '@/lib/types';
import { Button, Card, Skeleton, Surface } from '@heroui/react';
import { useUser } from '@/lib/firebase/provider';
import { LandingPage } from '@/components/pages/landing-page';
import { authFetch } from '@/lib/api-client';
import type { User } from 'firebase/auth';
import { ArrowRight, FolderTree, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

const AUTH_PENDING_ERROR = 'Authentication pending';

function FilesBrowserContent({ user }: { user: User }) {
  const [fileSystem, setFileSystem] = useState<FileSystemNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 3;

  const fetchFileSystem = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/api/filesystem');

      // Check content type before parsing JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (response.status === 401) {
          // User not authenticated yet, set error to trigger retry
          setError(AUTH_PENDING_ERROR);
          return;
        }
        throw new Error(`Unexpected response type: ${contentType}`);
      }

      if (!response.ok) {
        if (response.status === 401) {
          // Auth may not be ready yet
          setError(AUTH_PENDING_ERROR);
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch file system');
      }

      const data = await response.json();
      setFileSystem(data.fileSystem);
      retryCount.current = 0; // Reset on success
    } catch (err) {
      console.error('Error fetching file system:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when component mounts or user changes
  useEffect(() => {
    retryCount.current = 0; // Reset retry count on user change
    fetchFileSystem();
  }, [fetchFileSystem, user.uid]);

  // Bounded retry for auth pending errors - max 3 attempts with exponential backoff
  useEffect(() => {
    if (error === AUTH_PENDING_ERROR && retryCount.current < MAX_RETRIES) {
      const delay = 500 * Math.pow(2, retryCount.current); // Exponential backoff
      const timer = setTimeout(() => {
        retryCount.current += 1;
        console.log(`Retrying filesystem fetch (attempt ${retryCount.current}/${MAX_RETRIES})...`);
        fetchFileSystem();
      }, delay);
      return () => clearTimeout(timer);
    } else if (error === AUTH_PENDING_ERROR && retryCount.current >= MAX_RETRIES) {
      console.error(`Max retries (${MAX_RETRIES}) reached for filesystem. Giving up.`);
      setError('Unable to authenticate. Please refresh the page or try logging in again.');
    }
  }, [error, fetchFileSystem]);

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
              <Link href="/recordings">
                <Button className="rounded-full px-5 font-semibold">
                  Back to recordings
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
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

  // Show loading state while checking auth
  if (isUserLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <Skeleton className="h-14 w-72 rounded-[1.5rem]" />
        <Skeleton className="h-[420px] rounded-[1.9rem]" />
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!user) {
    return <LandingPage />;
  }

  return <FilesBrowserContent user={user} />;
}
