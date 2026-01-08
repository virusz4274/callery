'use client';

import React from 'react';

import { useContacts } from '@/hooks/use-contacts';
import { Skeleton } from '@heroui/react';
import { ContactsPage } from '@/components/pages/contacts-page';

function ContactsContainer() {


  const { data: contactsData, isLoading: isLoadingContacts, loadMore, hasMore, totalCount } = useContacts();

  // Use API response directly (no transformation needed)
  const allContacts = contactsData ?? [];

  if (isLoadingContacts) {
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

  return <ContactsPage allContacts={allContacts} loadMore={loadMore} hasMore={hasMore} totalCount={totalCount} />;
}

export default function Contacts() {
  return <ContactsContainer />
}
