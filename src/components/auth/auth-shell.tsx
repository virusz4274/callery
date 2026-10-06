'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@heroui/react';
import { FileText, Search, Users, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/icons';

const highlights = [
  { icon: Search, title: 'Find the conversation', description: 'Search transcripts, contacts, or the meaning behind a call.' },
  { icon: FileText, title: 'Keep the full picture', description: 'Audio, transcripts, and summaries together in one place.' },
  { icon: Users, title: 'Connect the dots', description: 'Keep your people and their conversations organized.' },
];

type AuthShellProps = {
  badge: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  compactOnMobile?: boolean;
};

export function AuthShell({ badge, title, description, children, footer, compactOnMobile = false }: AuthShellProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-20 items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <Logo className="size-7" />Callery
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />Back to site
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-12 py-6 lg:grid-cols-2 lg:gap-20 lg:py-12">
          <div className="hidden space-y-10 lg:block">
            <div className="space-y-5">
              <p className="text-sm font-medium text-accent">A little clarity for every conversation.</p>
              <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Your calls.<br />A clearer picture.</h2>
              <p className="max-w-sm text-base leading-7 text-muted">Bring your recordings together and find the details that matter, whenever you need them.</p>
            </div>
            <div className="space-y-6">
              {highlights.map(({ icon: Icon, title: highlightTitle, description: detail }) => (
                <div key={highlightTitle} className="flex max-w-md items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">{highlightTitle}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Card className="mx-auto w-full max-w-md gap-0 rounded-2xl border border-border bg-surface p-0 shadow-surface">
            <Card.Header className={compactOnMobile ? 'gap-2 px-6 pt-6 sm:px-8 sm:pt-8' : 'gap-3 px-6 pt-8 sm:px-8'}>
              <p className="text-xs font-medium text-muted">{badge}</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
              <p className="text-sm leading-6 text-muted">{description}</p>
            </Card.Header>
            <Card.Content className="px-6 py-6 sm:px-8">{children}</Card.Content>
            {footer && <Card.Footer className="border-t border-border px-6 py-5 sm:px-8">{footer}</Card.Footer>}
          </Card>
        </div>
        <p className="pb-6 text-center text-xs text-muted">Your conversations, organized.</p>
      </div>
    </div>
  );
}
