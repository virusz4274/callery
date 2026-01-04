
'use client';

import React from 'react';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import type { CallRecording, Contact } from '@/lib/types';
import { ContactsPage } from '@/components/contacts-page';

function ContactsContainer() {
  const { user } = useUser();
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

  const isLoading = isLoadingContacts || isLoadingRecordings;

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

  return <ContactsPage allContacts={allContacts || []} allRecordings={allRecordings || []} />;
}

export default function Contacts() {
    return <ContactsContainer />
}
