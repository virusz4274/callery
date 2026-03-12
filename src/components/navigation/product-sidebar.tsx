'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Chip } from '@heroui/react';
import { navigationConfig } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/icons';
import { ArrowRight, Settings } from 'lucide-react';
import type { User as UserProfile } from '@/lib/types';

type ProductSidebarProps = {
    userProfile: UserProfile | null;
};

export function ProductSidebar({ userProfile }: ProductSidebarProps) {
    const pathname = usePathname();
    const isAdminRoute = pathname.startsWith('/admin');

    const primaryNav = isAdminRoute
        ? [...navigationConfig.admin, { href: '/recordings', name: 'Back to app', icon: ArrowRight }]
        : navigationConfig.main;

    const secondaryNav = isAdminRoute
        ? [{ href: '/settings', name: 'Workspace settings', icon: Settings }]
        : [
              { href: '/settings', name: 'Settings', icon: Settings },
              ...(userProfile?.role === 'admin' ? [navigationConfig.adminLink] : []),
          ];

    return (
        <aside className="hidden w-[272px] shrink-0 border-r border-default-200/80 bg-default-50/60 px-4 py-5 md:flex md:flex-col md:gap-6">
            <Link href="/recordings" className="rounded-[1.25rem] border border-default-200/80 bg-background px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-default-200/80 bg-default-50 text-primary">
                        <Logo className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Workspace</div>
                        <div className="text-base font-bold tracking-[-0.03em] text-foreground">VoSift</div>
                    </div>
                </div>
            </Link>

            <div className="space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-default-400">Primary</div>
                {primaryNav.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/recordings' && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-[1rem] border px-3 py-2.5 text-sm font-medium transition-colors',
                                isActive
                                    ? 'border-primary/25 bg-primary/10 text-primary'
                                    : 'border-transparent text-default-600 hover:border-default-200 hover:bg-background hover:text-foreground'
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                        </Link>
                    );
                })}
            </div>

            <div className="space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-default-400">Workspace</div>
                {secondaryNav.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-[1rem] border px-3 py-2.5 text-sm font-medium transition-colors',
                                isActive
                                    ? 'border-primary/25 bg-primary/10 text-primary'
                                    : 'border-transparent text-default-600 hover:border-default-200 hover:bg-background hover:text-foreground'
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                        </Link>
                    );
                })}
            </div>

            <div className="mt-auto rounded-[1.25rem] border border-default-200/80 bg-background p-4">
                <div className="space-y-2">
                    <Chip variant="soft" size="sm" color="accent">
                        Shell refresh
                    </Chip>
                    <p className="text-sm leading-6 text-default-600">
                        Left rail keeps key routes persistent while the top bar stays utility-focused.
                    </p>
                </div>
            </div>
        </aside>
    );
}
