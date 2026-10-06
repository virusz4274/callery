'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Chip, SearchField, Skeleton, Surface } from '@heroui/react';
import type { Contact } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useUser } from '@/lib/auth/client';
import { ContactList } from './contacts/contact-list';
import { useContactGroups } from './contacts/use-contact-groups';
import { PageHeader } from '@/components/page-header';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';

type ContactsPageProps = {
    allContacts: Contact[];
    loadMore?: () => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    totalCount?: number;
};

function ContactsShellLoadingState() {
    return (
        <div className="space-y-8">
            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="space-y-5 px-5 py-6 md:px-8 md:py-8">
                    <div className="flex gap-2">
                        <Chip variant="soft" color="default">Contact directory</Chip>
                        <Chip variant="soft" color="accent">Loading</Chip>
                    </div>
                    <div className="space-y-3">
                        <Skeleton className="h-12 w-40 rounded-2xl" />
                        <Skeleton className="h-4 w-full max-w-2xl rounded-xl" />
                        <Skeleton className="h-4 w-full max-w-xl rounded-xl" />
                    </div>
                </div>
            </section>
            <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 p-5 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
                <div className="space-y-4">
                    <Skeleton className="h-10 rounded-2xl" />
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                </div>
            </Card>
        </div>
    );
}

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
    const { userProfile } = useUserProfile(user);

    const { groupedContacts, sortedAndFilteredContacts } = useContactGroups(allContacts, searchQuery);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace(buildLoginRedirectHref('/contacts'));
        }
    }, [isUserLoading, router, user]);

    const handleContactClick = (contactId?: string) => {
        if (!contactId) {
            return;
        }
        router.push(`/contacts/${contactId}`);
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
        return <ContactsShellLoadingState />;
    }

    const displayedCount = searchQuery ? sortedAndFilteredContacts.length : totalCount || sortedAndFilteredContacts.length;

    return (
        <div className="min-w-0 space-y-6">


            <PageHeader
                title="Contacts"
                description="The people behind your conversations. Search names, numbers, and companies."
                meta={<Chip variant="soft" color="default" size="sm">{displayedCount} contact{displayedCount === 1 ? '' : 's'}</Chip>}
                actions={<Button variant="secondary" onPress={() => router.push('/settings?tab=sources')}>Manage sources</Button>}
            />
            <div className="space-y-3">
                        {!userProfile?.googleSync?.hasRefreshToken ? (
                            <Alert status="accent">
                                <Alert.Indicator />
                                <Alert.Content>
                                    <Alert.Title>Want Google Contacts here?</Alert.Title>
                                    <Alert.Description>
                                        Connect Google Contacts in Settings › Sources to import names and numbers.
                                    </Alert.Description>
                                    <Link href="/settings?tab=sources" className="mt-2 inline-block">
                                        <Button size="sm" variant="secondary" className="rounded-full">
                                            Go to Sources
                                        </Button>
                                    </Link>
                                </Alert.Content>
                            </Alert>
                        ) : null}
                        {(userProfile?.googleSync?.duplicatePhoneIssueCount || 0) > 0 ? (
                            <Alert status="warning">
                                <Alert.Indicator />
                                <Alert.Content>
                                    <Alert.Title>Review duplicate numbers in Google Contacts</Alert.Title>
                                    <Alert.Description>
                                        {userProfile?.googleSync?.duplicatePhoneIssueCount} phone number{userProfile?.googleSync?.duplicatePhoneIssueCount === 1 ? '' : 's'} currently appear on multiple Google contacts. Vosift keeps them separate until you fix them in Google Contacts.
                                    </Alert.Description>
                                    <Link href="/settings?tab=sources" className="mt-2 inline-block">
                                        <Button size="sm" variant="secondary" className="rounded-full">
                                            Review sync issues
                                        </Button>
                                    </Link>
                                </Alert.Content>
                            </Alert>
                        ) : null}
            </div>

            <Surface
                variant="default"
                className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-none"
            >
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-muted">
                            Search directory
                        </div>
                        {searchQuery ? (
                            <Chip variant="soft" color="warning" size="sm">
                                {displayedCount} match{displayedCount === 1 ? '' : 'es'}
                            </Chip>
                        ) : (
                            <Chip variant="soft" color="default" size="sm">
                                {displayedCount} visible
                            </Chip>
                        )}
                    </div>

                    <SearchField
                        aria-label="Search contacts"
                        value={searchQuery}
                        onChange={(value) => {
                            const params = new URLSearchParams(searchParams.toString());
                            if (value) {
                                params.set('q', value);
                            } else {
                                params.delete('q');
                            }
                            const query = params.toString();
                            router.replace(query ? `/contacts?${query}` : '/contacts');
                        }}
                        variant="secondary"
                        className="w-full"
                    >
                        <SearchField.Group className="flex h-11 items-center overflow-hidden rounded-lg border border-border bg-field px-3 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                            <SearchField.SearchIcon className="mr-2 text-default-400" />
                            <SearchField.Input
                                className="w-full bg-transparent p-0 text-base text-foreground placeholder:text-default-400"
                                placeholder="Search by name, number, role, or company"
                            />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </div>
            </Surface>

            <ContactList
                groupedContacts={groupedContacts}
                searchQuery={searchQuery}
                hasMore={hasMore}
                onContactClick={handleContactClick}
                showGoogleSetup={!userProfile?.googleSync?.hasRefreshToken}
                setSentinelRef={(node) => {
                    sentinelRef.current = node;
                }}
                isLoadingMore={isLoadingMore}
            />
        </div>
    );
}
