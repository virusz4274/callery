'use client';

import { cn } from '@/lib/utils';

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

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-2xl bg-default-200/70 dark:bg-default-100/10', className)}
    />
  );
}

export function WorkspaceLoadingState({
  badge,
  title,
  description,
  statsCount = 4,
  listCount = 4,
}: WorkspaceLoadingStateProps) {
  return (
    <div className="relative space-y-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

      <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
        <div className="space-y-5 px-5 py-6 md:px-8 md:py-8">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-default-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              {badge}
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Loading
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-default-600 md:text-lg">
              {description}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: statsCount }).map((_, index) => (
              <SkeletonBlock key={index} className="h-24 rounded-[1.4rem]" />
            ))}
          </div>
        </div>
      </section>

      <div className="rounded-[1.75rem] border border-default-200/80 bg-background/95 p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
        <div className="space-y-4">
          <SkeletonBlock className="h-12 rounded-[1rem]" />
          <div className="grid gap-3">
            {Array.from({ length: listCount }).map((_, index) => (
              <SkeletonBlock key={index} className="h-20 rounded-[1.2rem]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthLoadingState({
  badge,
  title,
  description,
}: AuthLoadingStateProps) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(0,111,238,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(148,82,255,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,250,1))] text-foreground dark:bg-[radial-gradient(circle_at_top_left,rgba(0,111,238,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,82,255,0.12),transparent_24%),linear-gradient(180deg,rgba(18,18,22,1),rgba(12,12,16,1))]">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)] lg:gap-10 lg:px-8 lg:py-8">
        <div className="flex items-center justify-between py-2 lg:col-span-2">
          <SkeletonBlock className="h-12 w-36 rounded-full" />
          <SkeletonBlock className="h-10 w-28 rounded-full" />
        </div>

        <div className="hidden rounded-[2rem] border border-default-200/60 bg-background/80 px-8 py-10 shadow-xl shadow-black/5 lg:block">
          <div className="space-y-6">
            <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Workspace preview
            </span>
            <SkeletonBlock className="h-12 w-full max-w-md rounded-[1.4rem]" />
            <SkeletonBlock className="h-5 w-full max-w-xl rounded-full" />
            <SkeletonBlock className="h-5 w-full max-w-lg rounded-full" />
            <div className="grid gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-28 rounded-[1.5rem]" />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-default-200/70 bg-background/92 p-6 shadow-2xl shadow-black/10 backdrop-blur-md sm:p-8">
          <div className="space-y-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-primary/10">
              <SkeletonBlock className="h-8 w-8 rounded-xl bg-primary/20 dark:bg-primary/20" />
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-default-500">
                {badge}
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {title}
                </h1>
                <p className="max-w-md text-sm leading-6 text-default-600 sm:text-base">
                  {description}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <SkeletonBlock className="h-12 rounded-[1rem]" />
              <SkeletonBlock className="h-12 rounded-[1rem]" />
              <SkeletonBlock className="h-12 rounded-[1rem]" />
              <SkeletonBlock className="h-12 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminLoadingState() {
  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.10),transparent_28%)]" />

      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
          <div className="space-y-5 px-5 py-6 md:px-8 md:py-8">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Admin console
              </span>
              <span className="rounded-full bg-default-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                Loading
              </span>
            </div>
            <SkeletonBlock className="h-14 w-full max-w-md rounded-[1.5rem]" />
            <SkeletonBlock className="h-5 w-full max-w-3xl rounded-full" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-24 rounded-[1.4rem]" />
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
          <div className="rounded-[1.9rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.45)]">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-14 rounded-[1.1rem]" />
              ))}
            </div>
          </div>

          <div className="rounded-[1.9rem] border border-default-200/80 bg-background/95 p-5 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.45)]">
            <div className="space-y-4">
              <SkeletonBlock className="h-10 w-56 rounded-[1rem]" />
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-20 rounded-[1.2rem]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
