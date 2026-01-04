'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import type { CallRecording, Contact } from '@/lib/types';
import { LandingPage } from '@/components/pages/landing-page';
import { RecordingsDashboard } from '@/components/recordings-dashboard';

function HomePageContent() {
  const { user, isUserLoading } = useUser();
  const searchParams = useSearchParams();
  const firestore = useFirestore();

  const contactsQuery = useMemoFirebase(
    () => (user ? query(collection(firestore, 'users', user.uid, 'contacts')) : null),
    [user, firestore]
  );
  const recordingsQuery = useMemoFirebase(
    () => (user ? query(collection(firestore, 'users', user.uid, 'recordings')) : null),
    [user, firestore]
  );

  const { data: allContacts, isLoading: isLoadingContacts } = useCollection<Contact>(contactsQuery);
  const { data: allRecordings, isLoading: isLoadingRecordings } = useCollection<CallRecording>(recordingsQuery);

  const filter = React.useMemo(
    () => ({
      type: searchParams.get('filterType'),
      value: searchParams.get('filterValue'),
    }),
    [searchParams]
  );

  const searchQuery = searchParams.get('q') || '';

  const isLoading = isUserLoading || isLoadingContacts || isLoadingRecordings;

  if (isLoading) {
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
      <RecordingsDashboard
        allRecordings={allRecordings || []}
        allContacts={allContacts || []}
        filter={filter}
        searchQuery={searchQuery}
      />
    </Suspense>
  );
}

export default function Home() {
  return <HomePageContent />;
}
