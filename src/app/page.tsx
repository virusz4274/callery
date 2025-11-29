"use client"
import React, { useState, useMemo } from 'react';
import type { CallRecording, Contact } from '@/lib/types';
import { RecordingsDashboard } from '@/components/recordings-dashboard';
import { recordings, contacts } from '@/lib/data';


export default function Home() {
    // This state is managed in AppLayout now, but we might need local state for page-specific filtering
    const [filter, setFilter] = useState<{ type: string | null; value: string | null }>({ type: null, value: null });
    const [searchQuery, setSearchQuery] = useState('');

    const filteredRecordings = useMemo(() => {
        return recordings.filter(rec => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = searchQuery === '' ||
                rec.contactName?.toLowerCase().includes(searchLower) ||
                rec.phoneNumber.includes(searchLower) ||
                rec.transcriptSnippet.toLowerCase().includes(searchLower);

            if (!filter.type) {
                return matchesSearch;
            }
            
            let matchesFilter = false;
            if (filter.type === 'contact') {
                if (filter.value === 'Unknown') {
                    matchesFilter = !rec.contactName;
                } else {
                    matchesFilter = rec.contactName === filter.value;
                }
            } else if (filter.type === 'date') {
                const recDate = new Date(rec.date);
                const [filterMonth, filterYear] = filter.value?.split(' ') || [];
                matchesFilter = recDate.toLocaleString('default', { month: 'long' }) === filterMonth &&
                                recDate.getFullYear().toString() === filterYear;
            }

            return matchesSearch && matchesFilter;
        });
    }, [searchQuery, filter]);

  return (
    <RecordingsDashboard 
        allRecordings={recordings}
        allContacts={contacts}
        searchQuery={searchQuery}
        filter={filter}
    />
  );
}
