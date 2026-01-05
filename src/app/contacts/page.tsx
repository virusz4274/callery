
'use client';

import React, { useMemo } from 'react';
import { useUser } from '@/lib/firebase/provider';
import { useRecordings } from '@/hooks/use-recordings';
import { useContacts } from '@/hooks/use-contacts';
import { Skeleton } from '@heroui/react';
import type { CallRecording, Contact } from '@/lib/types';
import { ContactsPage } from '@/components/contacts-page';

/**
 * Transform API response to match existing types.
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

function ContactsContainer() {
  const { user } = useUser();

  const { data: contactsData, isLoading: isLoadingContacts, loadMore, hasMore } = useContacts();

  const allContacts = useMemo(() => {
    return contactsData?.map(toContact) || [];
  }, [contactsData]);

  const isLoading = isLoadingContacts;

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  return <ContactsPage allContacts={allContacts} loadMore={loadMore} hasMore={hasMore} />;
}

export default function Contacts() {
  return <ContactsContainer />
}
