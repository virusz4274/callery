"use client";
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { CallRecording, Contact } from '@/lib/types';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { RecordingsDashboard } from '@/components/recordings-dashboard';
import { ContactsPage } from '@/components/contacts-page';

type AppLayoutProps = {
  allRecordings: CallRecording[];
  allContacts: Contact[];
  children: React.ReactNode;
};

export function AppLayout({ allRecordings, allContacts, children }: AppLayoutProps) {
    const [filter, setFilter] = useState<{ type: string | null; value: string | null }>({ type: null, value: null });
    const [searchQuery, setSearchQuery] = useState('');
    const pathname = usePathname();

    const onFilterChange = (newFilter: { type: string | null; value: string | null }) => {
        setFilter(newFilter);
        // If a filter is applied, we assume the user wants to see the recordings dashboard
        if (newFilter.type && pathname !== '/') {
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
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
                        currentFilter={filter}
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
