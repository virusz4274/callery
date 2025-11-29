
"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CallRecording, Contact } from '@/lib/types';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';

type AppLayoutProps = {
  allRecordings: CallRecording[];
  allContacts: Contact[];
  children: React.ReactNode;
};

export function AppLayout({ allRecordings, allContacts, children }: AppLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();


    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const filter = {
      type: searchParams.get('filterType'),
      value: searchParams.get('filterValue'),
    };
    
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

    const onFilterChange = (newFilter: { type: string | null; value: string | null }) => {
        const params = new URLSearchParams(searchParams.toString());
        if (newFilter.type && newFilter.value) {
            params.set('filterType', newFilter.type);
            params.set('filterValue', newFilter.value);
        } else {
            params.delete('filterType');
            params.delete('filterValue');
        }
        
        router.push(`${pathname === '/' ? '/' : '/?'}?${params.toString()}`);
    };
    
    return (
        <div className="min-h-screen w-full bg-background">
            <SidebarProvider>
                <AppSidebar 
                    onFilterChange={onFilterChange} 
                    allRecordings={allRecordings}
                    currentFilter={filter}
                />
                <SidebarInset>
                    <AppHeader 
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                    />
                    <main className="p-4 sm:p-6 lg:p-8 flex-1">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </div>
    );
}
