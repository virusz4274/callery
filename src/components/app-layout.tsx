"use client";
import React, { useState } from 'react';
import type { CallRecording, Contact } from '@/lib/types';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { RecordingsDashboard } from '@/components/recordings-dashboard';

type AppLayoutProps = {
  allRecordings: CallRecording[];
  allContacts: Contact[];
};

export function AppLayout({ allRecordings, allContacts }: AppLayoutProps) {
    const [filter, setFilter] = useState<{ type: string | null; value: string | null }>({ type: null, value: null });
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className="min-h-screen w-full bg-background">
            <SidebarProvider>
                <AppSidebar 
                    onFilterChange={setFilter} 
                    allRecordings={allRecordings}
                    allContacts={allContacts}
                    currentFilter={filter}
                />
                <SidebarInset>
                    <AppHeader 
                        searchQuery={searchQuery} 
                        onSearchChange={setSearchQuery} 
                        currentFilter={filter}
                    />
                    <main className="p-4 sm:p-6 lg:p-8 flex-1">
                        <RecordingsDashboard 
                            allRecordings={allRecordings}
                            allContacts={allContacts}
                            searchQuery={searchQuery}
                            filter={filter}
                        />
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </div>
    );
}
