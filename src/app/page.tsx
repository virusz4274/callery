
"use client"

import React, { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { RecordingsDashboard } from '@/components/pages/recordings-dashboard';
import { recordings, contacts } from '@/lib/data/data';
import { LandingPage } from '@/components/pages/landing-page';

function Dashboard() {
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
  // In a real app, this would be determined by the user's authentication state.
  const isAuthenticated = false; // Set to true to see the dashboard

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Dashboard />
    </Suspense>
  );
}
