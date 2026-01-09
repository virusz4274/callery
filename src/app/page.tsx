'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/lib/firebase/provider';
import { useRecordings } from '@/hooks/use-recordings';
import { useContacts } from '@/hooks/use-contacts';
import { useStats } from '@/hooks/use-stats';
import { Skeleton } from '@/components/ui-primitives';
import { LandingPage } from '@/components/pages/landing-page';
import { RecordingsDashboard } from '@/components/recordings-dashboard';

/**
 * Dashboard content - only rendered when user is authenticated
 */
function AuthenticatedDashboard() {
  const searchParams = useSearchParams();
  const [page, setPage] = React.useState(1);
  const LIMIT = 10;

  // Fetch stats separately
  const { stats, isLoading: isLoadingStats } = useStats();

  const { data: contactsData, isLoading: isLoadingContacts } = useContacts();

  // Use API responses directly (no transformation needed)
  const allContacts = contactsData ?? [];

  const filter = useMemo(
    () => ({
      type: searchParams.get('filterType'),
      value: searchParams.get('filterValue'),
    }),
    [searchParams]
  );

  // State for new filters
  const [currentSort, setCurrentSort] = useState<{ by: 'date' | 'duration'; order: 'asc' | 'desc' }>({ by: 'date', order: 'desc' });
  const [currentDateFilter, setCurrentDateFilter] = useState<{ start?: string; end?: string }>({});

  const contactName = filter.type === 'contact' ? filter.value || undefined : undefined;

  // Fetch recordings with pagination
  const { data: recordingsData, isLoading: isLoadingRecordings, totalCount, refetch: refetchRecordings } = useRecordings({
    limit: LIMIT,
    skip: (page - 1) * LIMIT,
    includeArchived: false,
    contactName,
    sortBy: currentSort.by,
    sortOrder: currentSort.order,
    startDate: currentDateFilter.start,
    endDate: currentDateFilter.end
  });

  const allRecordings = recordingsData ?? [];

  const searchQuery = searchParams.get('q') || '';

  if (isLoadingRecordings || isLoadingContacts || isLoadingStats) {
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

  return (
    <Suspense fallback={<div>Loading Dashboard...</div>}>
      <RecordingsDashboard
        allRecordings={allRecordings}
        allContacts={allContacts}
        filter={filter}
        searchQuery={searchQuery}
        stats={stats}
        page={page}
        setPage={setPage}
        totalCount={totalCount}
        itemsPerPage={LIMIT}
        onRecordingsChange={refetchRecordings}
        onSortChange={(by, order) => setCurrentSort({ by, order })}
        onDateFilterChange={(start, end) => setCurrentDateFilter({ start, end })}
        currentSort={currentSort}
        currentDateFilter={currentDateFilter}
      />
    </Suspense>
  );
}

function HomePageContent() {
  const { user, isUserLoading } = useUser();

  // Show loading state while checking auth
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

  // Show landing page for unauthenticated users
  if (!user) {
    return <LandingPage />;
  }

  // Show dashboard for authenticated users
  return <AuthenticatedDashboard />;
}

export default function Home() {
  return <HomePageContent />;
}
