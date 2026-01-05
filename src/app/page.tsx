'use client';

import React, { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/lib/firebase/provider';
import { useRecordings } from '@/hooks/use-recordings';
import { useContacts } from '@/hooks/use-contacts';
import { useStats } from '@/hooks/use-stats';
import { Skeleton } from '@heroui/react';
import type { CallRecording, Contact } from '@/lib/types';
import { LandingPage } from '@/components/pages/landing-page';
import { RecordingsDashboard } from '@/components/recordings-dashboard';

/**
 * Transform API response to match the existing CallRecording type.
 */
function toCallRecording(recording: {
  id: string;
  contactName: string | null;
  phoneNumber: string;
  recordedAt: string;
  duration: number;
  r2Key: string;
  transcriptSnippet: string;
  playbackUrl?: string;
}): CallRecording {
  return {
    id: recording.id,
    contactName: recording.contactName,
    phoneNumber: recording.phoneNumber,
    date: recording.recordedAt,
    duration: recording.duration,
    filePath: recording.playbackUrl || recording.r2Key,
    transcriptSnippet: recording.transcriptSnippet,
  };
}

/**
 * Transform API response to match the existing Contact type.
 */
function toContact(contact: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phoneNumber?: string;
  phoneNumbers: string[];
  jobTitle?: string;
  company?: string;
  googleContactId?: string;
  createdAt: string;
  totalRecordings: number;
  lastRecordingAt: string | null;
}): Contact {
  return {
    id: contact.id,
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    name: contact.name,
    phoneNumber: contact.phoneNumber,
    phoneNumbers: contact.phoneNumbers,
    jobTitle: contact.jobTitle,
    company: contact.company,
    googleContactId: contact.googleContactId,
    createdAt: contact.createdAt,
    role: 'user',
    plan: 'Free',
    timezone: '',
    notificationSettings: {
      activityDigest: 'weekly',
      ingestSuccess: true,
      ingestFail: true,
    },
    storageSettings: {
      deletionPolicy: 'never',
    },
    storageUsed: 0,
    storageAllocation: 0,
    transcriptionUsed: 0,
    transcriptionAllocation: 0,
    totalRecordings: contact.totalRecordings,
    lastRecordingAt: contact.lastRecordingAt,
  };
}

/**
 * Dashboard content - only rendered when user is authenticated
 */
function AuthenticatedDashboard() {
  const searchParams = useSearchParams();
  const [page, setPage] = React.useState(1);
  const LIMIT = 10;

  // Fetch stats separately
  const { stats, isLoading: isLoadingStats } = useStats();

  // Fetch recordings with pagination
  const { data: recordingsData, isLoading: isLoadingRecordings, totalCount, refetch: refetchRecordings } = useRecordings({
    limit: LIMIT,
    skip: (page - 1) * LIMIT,
    includeArchived: false,
  });

  const { data: contactsData, isLoading: isLoadingContacts } = useContacts();

  // Transform API responses to match existing types
  const allRecordings = useMemo(() => {
    return recordingsData?.map(toCallRecording) || [];
  }, [recordingsData]);

  const allContacts = useMemo(() => {
    return contactsData?.map(toContact) || [];
  }, [contactsData]);

  const filter = useMemo(
    () => ({
      type: searchParams.get('filterType'),
      value: searchParams.get('filterValue'),
    }),
    [searchParams]
  );

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
