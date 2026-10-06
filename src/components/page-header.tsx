'use client';

import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
          {meta}
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1">{actions}</div>}
    </section>
  );
}
