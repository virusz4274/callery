'use client';

import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-2 md:flex-nowrap md:items-start md:gap-4">
      <div className="min-w-0 space-y-1 md:space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold md:text-2xl tracking-tight text-foreground md:text-3xl">{title}</h1>
          {meta}
        </div>
        {description && <p className="hidden max-w-2xl text-sm leading-6 text-muted md:block">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 md:pt-1">{actions}</div>}
    </section>
  );
}
