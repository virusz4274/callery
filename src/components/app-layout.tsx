
"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { MobileNav } from './mobile-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { ClientOnly } from './client-only';
import { EmailVerificationAlert } from './email-verification-alert';

type AppLayoutProps = {
  children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const isMobile = useIsMobile();

    // Initialize state from URL search params, but only on initial render
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const showHamburger = process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU === 'true';
    
    // Effect to update URL when searchQuery changes
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (searchQuery) {
            params.set('q', searchQuery);
        } else {
            params.delete('q');
        }

        const newPath = `${pathname}?${params.toString()}`;
        
        // Use transition to avoid blocking UI, and replace state to avoid polluting history
        startTransition(() => {
            router.replace(newPath, { scroll: false });
        });
    // This effect should ONLY run when the user-driven searchQuery or the pathname changes.
    }, [searchQuery, pathname]);

    // Effect to clear search when navigating to a new page
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
                <EmailVerificationAlert />
                {children}
            </main>
            <ClientOnly>
              {isMobile && !showHamburger && <MobileNav />}
            </ClientOnly>
        </div>
    );
}
