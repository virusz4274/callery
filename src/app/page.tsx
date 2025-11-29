"use client"
import React, { useState, useMemo } from 'react';
import type { CallRecording, Contact } from '@/lib/types';
import { RecordingsDashboard } from '@/components/recordings-dashboard';
import { recordings, contacts } from '@/lib/data';
import { useSearchParams } from 'next/navigation';


export default function Home() {
    const searchParams = useSearchParams();
    const filterType = searchParams.get('filterType');
    const filterValue = searchParams.get('filterValue');
    const searchQuery = searchParams.get('q') || '';

    const filter = useMemo(() => ({
        type: filterType,
        value: filterValue,
    }), [filterType, filterValue]);

  return (
    <RecordingsDashboard 
        allRecordings={recordings}
        allContacts={contacts}
        searchQuery={searchQuery}
        filter={filter}
    />
  );
}
