"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@heroui/react';
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

  return (
    <header className="sticky top-0 z-40 w-full border-b border-default-200/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-default-200 bg-default-50 text-primary shadow-sm">
              <Logo className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold uppercase tracking-[0.22em] text-default-500">
                Callery
              </div>
              <div className="hidden text-sm text-default-600 sm:block">
                Call Archive & AI Search
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-default-200/80 bg-background/80 p-1 md:flex">
            {marketingLinks.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-default-500 hover:bg-default-100 hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeSwitcher />
          <Link
            href="/login"
            className="hidden rounded-full px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-default-100 sm:block"
          >
            Log in
          </Link>
          <Link href="/signup">
            <Button size="sm" variant="primary" className="rounded-full px-6 font-semibold">
              Start free
            </Button>
          </Link>
        </div>
      </div>

      <div className="border-t border-default-200/70 md:hidden">
        <nav className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto px-4 py-2">
          {marketingLinks.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-default-100 text-default-600'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
