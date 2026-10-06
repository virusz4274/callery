'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navigationConfig } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/icons';
import { ArrowRight, CircleHelp, Settings } from 'lucide-react';
import type { User as UserProfile } from '@/lib/types';

type ProductSidebarProps = { userProfile: UserProfile | null };

export function ProductSidebar({ userProfile }: ProductSidebarProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin');
  const primaryNav = isAdminRoute
    ? [...navigationConfig.admin, { href: '/recordings', name: 'Back to app', icon: ArrowRight }]
    : navigationConfig.main;
  const secondaryNav = [
    { href: '/settings', name: 'Settings', icon: Settings },
    ...(userProfile?.role === 'admin' && !isAdminRoute ? [navigationConfig.adminLink] : []),
  ];

  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <Link href="/recordings" aria-label="Callery home" className="flex h-16 shrink-0 items-center gap-2.5 px-6">
        <Logo className="size-7" />
        <span className="text-xl font-semibold tracking-tight">Callery</span>
      </Link>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5">
        <p className="mb-3 px-3 text-xs font-medium text-muted">Your workspace</p>
        <nav aria-label="Workspace" className="space-y-1">
          {primaryNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
            return (
              <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined}
                className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-secondary hover:text-foreground')}>
                <item.icon className="size-[18px]" aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <nav aria-label="Workspace tools" className="mt-7 space-y-1 border-t border-border pt-4">
          {secondaryNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined}
                className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-secondary hover:text-foreground')}>
                <item.icon className="size-[18px]" aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <Link href="/support" className="mt-auto flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
          <CircleHelp className="size-[18px]" aria-hidden="true" />
          Help & support
        </Link>
      </div>
      <div className="border-t border-border px-6 py-4">
        <p className="text-xs font-medium text-muted">Your conversations, organized.</p>
      </div>
    </aside>
  );
}
