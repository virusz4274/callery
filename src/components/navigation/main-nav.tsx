'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navigationConfig } from '@/config/navigation';
import { Shield } from 'lucide-react';
import type { User as UserProfile } from '@/lib/types';

interface MainNavProps {
    userProfile: UserProfile | null;
    loggedIn: boolean;
}

export function MainNav({ userProfile, loggedIn }: MainNavProps) {
    const pathname = usePathname();

    if (!loggedIn) {
        return (
            <nav className="hidden md:flex items-center gap-1 mx-6">
                {navigationConfig.public.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2 py-2 px-3 rounded-full text-sm font-medium transition-all duration-200",
                            pathname === item.href
                                ? "text-primary bg-primary/10"
                                : "text-default-500 hover:text-foreground hover:bg-default-100"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", pathname === item.href && "text-primary")} />
                        {item.name}
                    </Link>
                ))}
            </nav>
        );
    }

    return (
        <nav className="hidden md:flex items-center gap-1 mx-6">
            {navigationConfig.main.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                        "flex items-center gap-2 py-2 px-3 rounded-full text-sm font-medium transition-all duration-200",
                        pathname === item.href
                            ? "text-primary bg-primary/10"
                            : "text-default-500 hover:text-foreground hover:bg-default-100"
                    )}
                >
                    <item.icon className={cn("h-4 w-4", pathname === item.href && "text-primary")} />
                    {item.name}
                </Link>
            ))}

            {/* Admin Link if applicable */}
            {userProfile?.role === 'admin' && (
                <Link
                    href={navigationConfig.adminLink.href}
                    className={cn(
                        "flex items-center gap-2 py-2 px-3 rounded-full text-sm font-medium transition-all duration-200",
                        pathname.startsWith('/admin')
                            ? "text-primary bg-primary/10"
                            : "text-default-500 hover:text-foreground hover:bg-default-100"
                    )}
                >
                    <navigationConfig.adminLink.icon className={cn("h-4 w-4", pathname.startsWith('/admin') && "text-primary")} />
                    {navigationConfig.adminLink.name}
                </Link>
            )}
        </nav>
    );
}
