'use client';

import React from 'react';
import { Chip, Skeleton } from '@heroui/react';
import { ContactsPage } from '@/components/pages/contacts-page';
import { useContacts } from '@/hooks/use-contacts';

function ContactsLoadingState() {
    return (
        <div className="space-y-8">
            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="space-y-5 px-5 py-6 md:px-8 md:py-8">
                    <div className="flex gap-2">
                        <Chip variant="soft" color="default">Contact directory</Chip>
                        <Chip variant="soft" color="accent">Loading</Chip>
                    </div>
                    <div className="space-y-3">
                        <Skeleton className="h-12 w-48 rounded-2xl" />
                        <Skeleton className="h-4 w-full max-w-2xl rounded-xl" />
                        <Skeleton className="h-4 w-full max-w-xl rounded-xl" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {[1, 2, 3, 4].map((item) => (
                            <Skeleton key={item} className="h-24 rounded-[1.4rem]" />
                        ))}
                    </div>
                </div>
            </section>

            <div className="rounded-[1.75rem] border border-default-200/80 bg-background/95 p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
                <div className="space-y-4">
                    <Skeleton className="h-10 rounded-2xl" />
                    <div className="grid gap-3">
                        {[1, 2, 3, 4].map((item) => (
                            <Skeleton key={item} className="h-20 rounded-[1.2rem]" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ContactsWrapper() {
    const { data: contactsData, isLoading: isLoadingContacts, loadMore, hasMore, isLoadingMore, totalCount } = useContacts();
    const allContacts = contactsData ?? [];

    if (isLoadingContacts && allContacts.length === 0) {
        return <ContactsLoadingState />;
    }

    return (
        <ContactsPage
            allContacts={allContacts}
            loadMore={loadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            totalCount={totalCount}
        />
    );
}
