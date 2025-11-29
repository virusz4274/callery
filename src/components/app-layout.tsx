"use client";
import React, { useState, useEffect } from 'react';
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

    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const filter = {
      type: searchParams.get('filterType'),
      value: searchParams.get('filterValue'),
    };
    
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (searchQuery) {
            params.set('q', searchQuery);
        } else {
            params.delete('q');
        }
        router.replace(`${pathname}?${params.toString()}`);
    }, [searchQuery, pathname, router, searchParams]);

    const onFilterChange = (newFilter: { type: string | null; value: string | null }) => {
        const params = new URLSearchParams();
        if (newFilter.type && newFilter.value) {
            params.set('filterType', newFilter.type);
            params.set('filterValue', newFilter.value);
        }
        if (searchQuery) {
            params.set('q', searchQuery);
        }
        
        router.push(`/?${params.toString()}`);
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
                        allContacts={allContacts}
                    />
                    <main className="p-4 sm:p-6 lg:p-8 flex-1">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </div>
    );
}
