'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { useContacts } from '@/hooks/use-contacts';
import { ContactsPage } from '@/components/pages/contacts-page';

export function ContactsWrapper() {
    const searchParams = useSearchParams();
    const searchQuery = searchParams.get('q') || '';
    const { data: contactsData, isLoading: isLoadingContacts, loadMore, hasMore, isLoadingMore, totalCount } = useContacts(searchQuery);

    // Use API response directly (no transformation needed)
    const allContacts = contactsData ?? [];

    // Show loading only on initial fetch, not during pagination
    if (isLoadingContacts && allContacts.length === 0) {
        return <div className="p-4">Loading contacts...</div>;
    }

    return <ContactsPage allContacts={allContacts} loadMore={loadMore} hasMore={hasMore} isLoadingMore={isLoadingMore} totalCount={totalCount} />;
}
