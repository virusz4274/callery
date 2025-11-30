
"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';

type AppLayoutProps = {
  children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    
    useEffect(() => {
        const currentQuery = searchParams.get('q') || '';
        if(searchQuery !== currentQuery) {
            const params = new URLSearchParams(searchParams.toString());
            if (searchQuery) {
                params.set('q', searchQuery);
            } else {
                params.delete('q');
            }
            startTransition(() => {
                router.replace(`${pathname}?${params.toString()}`);
            });
        }
    }, [searchQuery, pathname, router, searchParams]);
    
    return (
        <div className="min-h-screen w-full bg-background flex flex-col">
            <AppHeader 
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />
            <main className="p-4 sm:p-6 lg:p-8 flex-1">
                {children}
            </main>
        </div>
    );
}
