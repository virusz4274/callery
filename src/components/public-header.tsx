'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/icons';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { cn } from '@/lib/utils';

const marketingLinks = [
  { href: '/', label: 'Overview' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/support', label: 'Support' },
  { href: '/changelog', label: 'Updates' },
];

export function PublicHeader() {
  const pathname = usePathname();
  const links = marketingLinks.map((item) => (
    <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}
      className={cn('inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors',
        pathname === item.href ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-secondary hover:text-foreground')}>
      {item.label}
    </Link>
  ));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-lg font-semibold tracking-tight">Callery</span>
          <span className="sr-only">Call Archive & AI Search</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">{links}</nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeSwitcher />
          <Link href="/login" className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-surface-secondary sm:inline-flex">Log in</Link>
          <Link href="/signup" className="button button--primary button--sm px-4">Start free</Link>
        </div>
      </div>
      <nav aria-label="Mobile site navigation" className="flex justify-center gap-1 border-t border-border px-3 py-1 md:hidden">{links}</nav>
    </header>
  );
}
