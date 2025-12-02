
"use client"

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { RecordingsDashboard } from '@/components/pages/recordings-dashboard';
import { recordings, contacts } from '@/lib/data/data';
import { LandingPage } from '@/components/pages/landing-page';
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';

function Dashboard() {
  const searchParams = useSearchParams();

  const filter = React.useMemo(() => ({
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

function HomePageContent() {
  const { user, isUserLoading } = useUser();

  if (isUserLoading) {
    return (
        <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-96" />
        </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return (
    <Suspense fallback={<div>Loading Dashboard...</div>}>
      <Dashboard />
    </Suspense>
  );
}

export default function Home() {
  return <HomePageContent />;
}
