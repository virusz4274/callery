'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileBrowserPage } from '@/components/pages/file-browser-page';
import type { FileSystemNode } from '@/lib/types';
import { Skeleton, Card } from '@heroui/react';
import { useUser } from '@/lib/firebase/provider';
import { LandingPage } from '@/components/pages/landing-page';
import { authFetch } from '@/lib/api-client';
import type { User } from 'firebase/auth';

function FilesBrowserContent({ user }: { user: User }) {
  const [fileSystem, setFileSystem] = useState<FileSystemNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFileSystem = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/api/filesystem');

      // Check content type before parsing JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (response.status === 401) {
          // User not authenticated yet, will retry
          setError('Authentication pending...');
          return;
        }
        throw new Error(`Unexpected response type: ${contentType}`);
      }

      if (!response.ok) {
        if (response.status === 401) {
          // Auth may not be ready yet, don't show error
          setError('Authentication pending...');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch file system');
      }

      const data = await response.json();
      setFileSystem(data.fileSystem);
    } catch (err) {
      console.error('Error fetching file system:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when component mounts or user changes
  useEffect(() => {
    fetchFileSystem();
  }, [fetchFileSystem, user.uid]);

  // Retry if we got an auth pending error
  useEffect(() => {
    if (error === 'Authentication pending...') {
      const timer = setTimeout(() => {
        fetchFileSystem();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [error, fetchFileSystem]);

  if (isLoading) {
    return (
      <div className="relative space-y-8">
        {/* Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            File Browser
          </h2>
          <p className="text-default-500 text-lg">
            Explore and manage your recordings
          </p>
        </div>

        <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl overflow-visible transition-all duration-300">
          <Card.Content className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  if (error && error !== 'Authentication pending...') {
    return (
      <div className="relative space-y-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight text-foreground">
            File Browser
          </h2>
          <p className="text-red-500">
            Error: {error}
          </p>
        </div>
      </div>
    );
  }

  if (!fileSystem) {
    return null;
  }

  return <FileBrowserPage rootNode={fileSystem} />;
}

export default function FilesPage() {
  const { user, isUserLoading } = useUser();

  // Show loading state while checking auth
  if (isUserLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!user) {
    return <LandingPage />;
  }

  return <FilesBrowserContent user={user} />;
}
