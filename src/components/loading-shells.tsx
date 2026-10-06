'use client';

import { Skeleton } from '@heroui/react';
import { AuthShell } from '@/components/auth/auth-shell';
import { PageHeader } from '@/components/page-header';

type WorkspaceLoadingStateProps = {
  badge: string;
  title: string;
  description: string;
  statsCount?: number;
  listCount?: number;
};

type AuthLoadingStateProps = {
  badge: string;
  title: string;
  description: string;
};

export function WorkspaceLoadingState({ badge, title, description, listCount = 4 }: WorkspaceLoadingStateProps) {
  return (
    <div className="min-w-0 space-y-6" role="status" aria-live="polite" aria-label={`Loading ${badge.toLowerCase()}`}>
      <PageHeader title={title} description={description} />
      <div className="rounded-xl border border-border bg-surface p-4">
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
      <div className="space-y-5 rounded-xl border border-border bg-surface p-5">
        {Array.from({ length: listCount }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 max-w-64 rounded-md" />
              <Skeleton className="h-3 w-full max-w-96 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuthLoadingState({ badge, title, description }: AuthLoadingStateProps) {
  return (
    <AuthShell badge={badge} title={title} description={description}>
      <div className="space-y-5" role="status" aria-label="Loading sign-in form">
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-11 rounded-lg" />
      </div>
    </AuthShell>
  );
}

export function AdminLoadingState() {
  return (
    <WorkspaceLoadingState
      badge="Admin console"
      title="Admin console"
      description="Loading workspace administration."
    />
  );
}
