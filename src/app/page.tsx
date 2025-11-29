
"use client"

import React, { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { RecordingsDashboard } from '@/components/recordings-dashboard';
import { recordings, contacts } from '@/lib/data';

function DashboardPage() {
  const searchParams = useSearchParams();

  const filter = useMemo(() => ({
    type: searchParams.get('filterType'),
    value: searchParams.get('filterValue'),
  }), [searchParams]);

  const searchQuery = searchParams.get('q') || '';

  return (
    <RecordingsDashboard 
      allRecordings={recordings}
      allContacts={contacts}
      searchQuery={searchQuery}
      filter={filter}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardPage />
    </Suspense>
  );
}
