'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button, Card, Chip, SearchField, Skeleton, Surface } from '@heroui/react';
import type { Contact } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/lib/firebase/provider';
import { ContactList } from './contacts/contact-list';
import { useContactGroups } from './contacts/use-contact-groups';
import { ContextHelp } from '@/components/context-help';
import { QuickStartPopover } from '@/components/quick-start-popover';
import { ArrowRight, Building2, Search, Users } from 'lucide-react';

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
            <Card className="rounded-[1.75rem] border border-default-200/80 bg-background/95 p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
                <div className="space-y-4">
                    <Skeleton className="h-10 rounded-2xl" />
                    <Skeleton className="h-24 rounded-[1.25rem]" />
                    <Skeleton className="h-24 rounded-[1.25rem]" />
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
    const uniqueCompanies = new Set(
        allContacts
            .map((contact) => contact.company?.trim())
            .filter((company): company is string => Boolean(company))
    ).size;
    const totalRecordings = allContacts.reduce((sum, contact) => sum + (contact.totalRecordings || 0), 0);

    return (
        <div className="relative min-w-0 overflow-x-clip space-y-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid min-w-0 gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_auto] xl:items-start">
                    <div className="min-w-0 space-y-4">
                        <div className="flex items-center gap-2">
                            <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                                Contact directory
                            </Chip>
                            <ContextHelp
                                title="Contacts workspace"
                                description="Use this page to find people fast and jump straight into their linked call history."
                                points={[
                                    'Search by name, company, role, or phone number.',
                                    'Open a contact to review recent conversations.',
                                    'Upload or sync more calls to grow the directory.',
                                ]}
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                    Contacts
                                </h1>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="default">
                                {displayedCount} visible
                            </Chip>
                            {searchQuery && (
                                <Chip variant="soft" color="warning">
                                    Search: {searchQuery}
                                </Chip>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
                        <QuickStartPopover
                            title="Get value from contacts quickly"
                            description="These are the fastest first-time actions for making the directory useful."
                            steps={[
                                {
                                    title: 'Search for a person or company',
                                    description: 'Start with the directory search box to find existing matches fast.',
                                },
                                {
                                    title: 'Open a contact workspace',
                                    description: 'Use a contact page to review linked calls and recent activity.',
                                },
                                {
                                    title: 'Add more matches',
                                    description: 'Upload more calls or sync data so future recordings connect to real people.',
                                    href: '/upload',
                                },
                            ]}
                        />
                        <Link href="/recordings" className="w-full sm:w-auto xl:w-full">
                            <Button variant="secondary" className="w-full rounded-full px-6 font-semibold">
                                View recordings
                            </Button>
                        </Link>
                        <Link href="/upload" className="w-full sm:w-auto xl:w-full">
                            <Button className="w-full rounded-full px-6 font-semibold">
                                Upload more calls
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid min-w-0 gap-3 border-t border-default-100/80 bg-default-50/50 px-5 py-5 md:grid-cols-2 md:px-8 xl:grid-cols-4">
                    <Surface variant="secondary" className="min-w-0 rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <Users className="h-3.5 w-3.5" />
                                Total contacts
                            </div>
                            <div className="text-2xl font-bold text-foreground">{totalCount || allContacts.length}</div>
                            <div className="text-sm text-default-500">
                                Everyone currently linked to your recordings
                            </div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="min-w-0 rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <Search className="h-3.5 w-3.5" />
                                Showing now
                            </div>
                            <div className="text-2xl font-bold text-foreground">{displayedCount}</div>
                            <div className="text-sm text-default-500">
                                Current result set after local directory search
                            </div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="min-w-0 rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <Building2 className="h-3.5 w-3.5" />
                                Companies
                            </div>
                            <div className="text-2xl font-bold text-foreground">{uniqueCompanies}</div>
                            <div className="text-sm text-default-500">
                                Distinct companies represented in the directory
                            </div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="min-w-0 rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <ArrowRight className="h-3.5 w-3.5" />
                                Linked calls
                            </div>
                            <div className="text-2xl font-bold text-foreground">{totalRecordings}</div>
                            <div className="text-sm text-default-500">
                                Total recordings connected to known contacts
                            </div>
                        </div>
                    </Surface>
                </div>
            </section>

            <Surface
                variant="default"
                className="min-w-0 rounded-[1.75rem] border border-default-200/80 p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]"
            >
                <div className="space-y-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            Search directory
                            <ContextHelp
                                title="Directory search"
                                description="This search runs locally against the contacts already loaded into the directory."
                                points={[
                                    'Matches name, phone number, company, and role.',
                                    'Open a result to inspect the linked calls for that person.',
                                ]}
                                placement="right"
                            />
                        </div>
                        <h2 className="text-xl font-bold tracking-[-0.03em] text-foreground">
                            Find a person, phone number, company, or role.
                        </h2>
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
                        <SearchField.Group className="flex h-12 items-center overflow-hidden rounded-2xl border border-default-200 bg-default-50 px-3 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                            <SearchField.SearchIcon className="mr-2 text-default-400" />
                            <SearchField.Input
                                className="w-full bg-transparent p-0 text-small text-foreground placeholder:text-default-400"
                                placeholder="Search by name, number, role, or company"
                            />
                        </SearchField.Group>
                    </SearchField>
                </div>
            </Surface>

            <ContactList
                groupedContacts={groupedContacts}
                searchQuery={searchQuery}
                hasMore={hasMore}
                onContactClick={handleContactClick}
                setSentinelRef={(node) => {
                    sentinelRef.current = node;
                }}
                isLoadingMore={isLoadingMore}
            />
        </div>
    );
}
