'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Alert, Button, Chip, SearchField, Skeleton, Surface } from '@heroui/react';
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
    totalCount: number;
    isLoading?: boolean;
    hasError?: boolean;
    hasListError?: boolean;
    isLoadMoreError: boolean;
    retry: () => void;
    libraryTotalCount?: number;
    isLibraryCountLoading: boolean;
    hasLibraryCountError: boolean;
    retryLibraryCount: () => void;
};

function ContactsShellLoadingState() {
    return (
        <div className="space-y-6" role="status" aria-label="Loading contacts">
            <Skeleton className="h-10 w-52 rounded-lg" />
            <Skeleton className="h-28 rounded-xl" />
            <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
                {[1, 2, 3].map(item => <Skeleton key={item} className="h-20 rounded-lg" />)}
            </div>
        </div>
    );
}

export function ContactsPage({
    allContacts,
    loadMore,
    hasMore = false,
    totalCount,
    isLoadingMore = false,
    isLoading = false,
    hasError = false,
    hasListError = false,
    isLoadMoreError,
    retry,
    libraryTotalCount,
    isLibraryCountLoading,
    hasLibraryCountError,
    retryLibraryCount,
}: ContactsPageProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchValue = searchParams.get('q') || '';
    const searchQuery = searchValue.trim();
    const { user, isUserLoading } = useUser();
    const { userProfile } = useUserProfile(user);
    const showGoogleSetup = !!userProfile && !userProfile.googleSync?.hasRefreshToken;

    const { groupedContacts } = useContactGroups(allContacts);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace(buildLoginRedirectHref('/contacts'));
        }
    }, [isUserLoading, router, user]);


    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const isLoadingMoreRef = useRef(isLoadingMore);

    useEffect(() => {
        isLoadingMoreRef.current = isLoadingMore;
    }, [isLoadingMore]);

    useEffect(() => {
        if (!loadMore || !hasMore || hasListError) {
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
    }, [hasMore, hasListError, isLoadingMore, loadMore]);

    useEffect(() => {
        if (isLoading) return;
        const raw = sessionStorage.getItem('vosift:contacts-return');
        if (!raw) return;
        try {
            const saved = JSON.parse(raw);
            if (saved.href === window.location.pathname + window.location.search) {
                const frame = requestAnimationFrame(() => { window.scrollTo({ top: saved.scroll, behavior: 'instant' }); sessionStorage.removeItem('vosift:contacts-return'); });
                return () => cancelAnimationFrame(frame);
            }
        } catch { sessionStorage.removeItem('vosift:contacts-return'); }
    }, [isLoading, searchQuery]);

    if (isUserLoading || !user) {
        return <ContactsShellLoadingState />;
    }

    const libraryCountLabel = libraryTotalCount !== undefined
        ? `${libraryTotalCount} contact${libraryTotalCount === 1 ? '' : 's'}`
        : hasLibraryCountError ? 'Count unavailable' : 'Loading total…';
    const matchLabel = isLoading ? 'Searching…' : hasError ? 'Matches unavailable'
        : `${totalCount} match${totalCount === 1 ? '' : 'es'}`;
    const updateSearch = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set('q', value);
        else params.delete('q');
        const query = params.toString();
        window.history.replaceState(null, '', query ? `/contacts?${query}` : '/contacts');
    };
    const clearSearch = () => {
        updateSearch('');
        searchInputRef.current?.focus();
    };

    return (
        <div className="min-w-0 space-y-6">
            <PageHeader
                title="Contacts"
                meta={<div className="flex flex-wrap items-center gap-2" data-testid="contacts-library-count">
                    <Chip variant="soft" color="default" size="sm" aria-busy={isLibraryCountLoading}>{libraryCountLabel}</Chip>
                    {hasLibraryCountError && <Button size="sm" variant="ghost" className="min-h-11 lg:min-h-9" onPress={retryLibraryCount} aria-label="Retry contact total">Retry total</Button>}
                </div>}
                actions={<Button variant="secondary" className="min-h-11 lg:min-h-9" onPress={() => router.push('/settings?tab=sources')}>Manage sources</Button>}
            />
            {((showGoogleSetup && (isLoading || hasError || allContacts.length > 0 || searchQuery)) || (userProfile?.googleSync?.duplicatePhoneIssueCount || 0) > 0) && <div className="space-y-3">
                        {showGoogleSetup && (isLoading || hasError || allContacts.length > 0 || searchQuery) ? (
                            <Surface className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-4">
                                <p className="text-sm text-muted">Connect Google Contacts to import names and numbers.</p>
                                <Link href="/settings?tab=sources" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Connect Google Contacts</Link>
                            </Surface>
                        ) : null}
                        {(userProfile?.googleSync?.duplicatePhoneIssueCount || 0) > 0 ? (
                            <Alert status="warning">
                                <Alert.Indicator />
                                <Alert.Content>
                                    <Alert.Title>Review duplicate numbers in Google Contacts</Alert.Title>
                                    <Alert.Description>
                                        {userProfile?.googleSync?.duplicatePhoneIssueCount} phone number{userProfile?.googleSync?.duplicatePhoneIssueCount === 1 ? '' : 's'} currently appear on multiple Google contacts. Vosift keeps them separate until you fix them in Google Contacts.
                                    </Alert.Description>
                                    <Link href="/settings?tab=sources" className="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">Review sync issues</Link>
                                </Alert.Content>
                            </Alert>
                        ) : null}
            </div>}

            <Surface
                variant="default"
                className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-none"
            >
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-muted">
                            Search directory
                        </div>
                        {searchQuery && <span role="status" className="text-sm text-muted" data-testid="contacts-match-count">{matchLabel}</span>}
                    </div>

                    <SearchField
                        aria-label="Search contacts"
                        value={searchValue}
                        onChange={updateSearch}
                        variant="secondary"
                        className="w-full"
                    >
                        <SearchField.Group className="flex h-11 items-center overflow-hidden rounded-lg border border-border bg-field px-3 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                            <SearchField.SearchIcon className="mr-2 shrink-0 text-muted" />
                            <SearchField.Input
                                ref={searchInputRef}
                                maxLength={200}
                                className="min-w-0 w-full bg-transparent p-0 text-base text-foreground placeholder:text-muted"
                                placeholder="Search by name, number, role, or company"
                            />
                            <SearchField.ClearButton className="min-h-11 min-w-11 shrink-0" />
                        </SearchField.Group>
                    </SearchField>
                </div>
            </Surface>

            {hasError && <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Could not load contacts</Alert.Title>
                    <Alert.Description>Try again to load {searchQuery ? 'these search results' : 'the directory'}.</Alert.Description>
                    <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-9" onPress={retry}>Retry</Button>
                </Alert.Content>
            </Alert>}
            {isLoading ? (
                <div role="status" aria-label="Loading contacts" className="space-y-3 rounded-xl border border-border bg-surface p-4">
                    {[1, 2, 3].map(item => <Skeleton key={item} className="h-20 rounded-xl" />)}
                </div>
            ) : hasError ? null : (
                <ContactList
                    groupedContacts={groupedContacts}
                    searchQuery={searchQuery}
                    hasMore={hasMore}
                    showGoogleSetup={showGoogleSetup}
                    setSentinelRef={(node) => {
                        sentinelRef.current = node;
                    }}
                    isLoadingMore={isLoadingMore}
                    hasError={hasListError}
                    isLoadMoreError={isLoadMoreError}
                    retry={retry}
                    loadMore={loadMore}
                    loadedCount={allContacts.length}
                    totalCount={totalCount}
                    clearSearch={clearSearch}
                />
            )}
        </div>
    );
}
