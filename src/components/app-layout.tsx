
"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { MobileNav } from './mobile-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { ClientOnly } from './client-only';

type AppLayoutProps = {
  children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const isMobile = useIsMobile();

    // Initialize state from URL search params
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const showHamburger = process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU === 'true';
    
    // Effect to update URL when searchQuery changes
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (searchQuery) {
            params.set('q', searchQuery);
        } else {
            params.delete('q');
        }
        // Use replace to avoid adding to history
        startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        });
    }, [searchQuery, pathname, router, searchParams]);

    // Effect to clear search when pathname changes
    useEffect(() => {
        setSearchQuery('');
    }, [pathname]);
    
    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            <AppHeader 
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 pb-24 md:pb-6">
                {children}
            </main>
            <ClientOnly>
              {isMobile && !showHamburger && <MobileNav />}
            </ClientOnly>
        </div>
    );
}
