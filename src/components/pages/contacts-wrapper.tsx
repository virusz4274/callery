'use client';

import { useSearchParams } from 'next/navigation';
import { ContactsPage } from '@/components/pages/contacts-page';
import { useContacts } from '@/hooks/use-contacts';
import { useContactsLibraryCount } from '@/hooks/use-contacts-library-count';
import { useUser } from '@/lib/auth/client';

export function ContactsWrapper() {
    const searchParams = useSearchParams();
    const { data: contactsData, isLoading: isLoadingContacts, error, refetch, loadMore, hasMore, isLoadingMore, isLoadMoreError, totalCount } = useContacts(searchParams.get('q') || '');
    const allContacts = contactsData ?? [];
    const { user } = useUser();
    const library = useContactsLibraryCount(user?.id);

    return (
        <ContactsPage
            allContacts={allContacts}
            loadMore={loadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            totalCount={totalCount}
            isLoading={isLoadingContacts}
            hasError={!!error && contactsData === null}
            hasListError={!!error}
            isLoadMoreError={isLoadMoreError}
            retry={() => { void refetch().catch(() => {}); }}
            libraryTotalCount={library.totalCount}
            isLibraryCountLoading={library.isLoading}
            hasLibraryCountError={!!library.error}
            retryLibraryCount={() => { void library.retry().catch(() => {}); }}
        />
    );
}
