'use client';

import React, { useEffect, useRef } from 'react';
import { Card } from '@heroui/react';
import type { Contact } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/lib/firebase/provider';
import { ContactList } from './contacts/contact-list';
import { useContactGroups } from './contacts/use-contact-groups';

type ContactsPageProps = {
    allContacts: Contact[];
    loadMore?: () => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    totalCount?: number;
};

export function ContactsPage({
    allContacts,
    loadMore,
    hasMore = false,
    totalCount = 0,
    isLoadingMore = false,
}: ContactsPageProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchQuery = searchParams.get('q') || '';
    const { user, isUserLoading } = useUser();

    const { groupedContacts, sortedAndFilteredContacts } = useContactGroups(allContacts, searchQuery);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [isUserLoading, router, user]);

    const handleContactClick = (contactId?: string) => {
        if (!contactId) {
            return;
        }
        router.push(`/recordings?contact=${contactId}`);
    };

    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const isLoadingMoreRef = useRef(isLoadingMore);

    useEffect(() => {
        isLoadingMoreRef.current = isLoadingMore;
    }, [isLoadingMore]);

    useEffect(() => {
        if (!loadMore || !hasMore) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !isLoadingMoreRef.current) {
                    loadMore();
                }
            },
            { threshold: 0.1 }
        );

        if (sentinelRef.current) {
            observer.observe(sentinelRef.current);
        }

        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, loadMore]);

    if (isUserLoading || !user) {
        return <div className="flex h-[50vh] items-center justify-center">Loading...</div>;
    }

    const displayedCount = searchQuery ? sortedAndFilteredContacts.length : totalCount || sortedAndFilteredContacts.length;

    return (
        <div className="relative space-y-8">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-0 right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="flex flex-col gap-2">
                <h2 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Contacts
                </h2>
                <p className="text-default-500 text-lg">Manage and view your contact directory</p>
            </div>

            <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-lg md:shadow-xl transition-all duration-300 rounded-xl md:rounded-2xl">
                <Card.Header className="flex flex-col items-start gap-1 pb-4 pt-6 px-6 border-b border-default-100/50">
                    <div className="flex justify-between w-full items-center">
                        <div className="text-sm font-medium text-default-500 uppercase tracking-wider">Directory</div>
                        <div className="text-sm text-default-400 bg-default-100/50 px-2 py-1 rounded-md">
                            {displayedCount} Contacts
                        </div>
                    </div>
                </Card.Header>

                <Card.Content className="p-0 relative overflow-hidden min-h-[400px]">
                    <ContactList
                        groupedContacts={groupedContacts}
                        searchQuery={searchQuery}
                        hasMore={hasMore}
                        isLoadingMore={isLoadingMore}
                        setSentinelRef={(node) => {
                            sentinelRef.current = node;
                        }}
                        onContactClick={handleContactClick}
                    />
                </Card.Content>
            </Card>
        </div>
    );
}
