'use client';

import { useSWRConfig } from 'swr';
import { ActionLink } from '@/components/action-link';
import { Avatar, Button, Card, Link, Spinner } from '@heroui/react';
import { ChevronRight, Phone } from 'lucide-react';
import type { Contact } from '@/lib/types';
import { ContactPhoneDisplay } from './contact-phone-display';

const columns = 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem_2.75rem]';

// Every row and the column heading share these gutters and column sizes.
const rowLayout = `grid min-w-0 gap-x-4 px-4 sm:px-6 ${columns}`;
const focusStyle = 'rounded-lg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type ContactListProps = {
    groupedContacts: Record<string, Contact[]>;
    searchQuery: string;
    hasMore: boolean;
    isLoadingMore: boolean;
    showGoogleSetup: boolean;
    setSentinelRef: (node: HTMLDivElement | null) => void;
    hasError: boolean;
    isLoadMoreError: boolean;
    retry: () => void;
    loadMore?: () => void;
    loadedCount: number;
    totalCount: number;
    clearSearch: () => void;
};

export function ContactList({
    groupedContacts, searchQuery, hasMore, isLoadingMore, showGoogleSetup,
    setSentinelRef, hasError, isLoadMoreError, retry, loadMore, loadedCount, totalCount, clearSearch,
}: ContactListProps) {
    const { mutate } = useSWRConfig();
    const hasContacts = loadedCount > 0;
    return (
        <Card className="min-w-0 gap-0 overflow-hidden p-0">
            {hasContacts ? (
                <>
                    <div className={`${rowLayout} hidden border-b border-border bg-surface-secondary py-3 text-sm font-medium text-muted lg:grid`} data-testid="contacts-columns" aria-hidden="true">
                        <span>Contact</span><span>Phone</span><span>Recordings</span><span className="text-center">Open</span>
                    </div>
                    {Object.entries(groupedContacts).map(([letter, contacts]) => (
                        <section key={letter} aria-label={`${letter} contacts`}>
                            <h2 className="border-y border-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-muted sm:px-6">{letter}</h2>
                            <ul>
                                {contacts.map(contact => (
                                    <li key={contact.id} className={`${rowLayout} group border-b border-border py-3 transition-colors last:border-b-0 hover:bg-surface-secondary`} data-testid="contact-row">
                                        <Link href={`/contacts/${contact.id}`} aria-label={`Open ${contact.name}`}
                                            onClick={() => {
                                                void mutate(['contact-detail', contact.authSubject, contact.id], contact, false);
                                                sessionStorage.setItem('vosift:contacts-return', JSON.stringify({ href: window.location.pathname + window.location.search, scroll: window.scrollY, id: contact.id }));
                                            }}
                                            className={`no-underline text-foreground w-full col-span-full row-start-1 grid grid-cols-[minmax(0,1fr)_2.75rem] items-start gap-x-4 ${columns} ${focusStyle}`}>
                                            <div className="flex min-w-0 items-center gap-3" data-testid="contact-identity">
                                                <Avatar className="size-11 shrink-0">
                                                    <Avatar.Fallback className="bg-surface-secondary text-base text-muted">{contact.name.charAt(0).toUpperCase() || '#'}</Avatar.Fallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <span className="flex min-h-11 items-center break-words text-base font-medium text-foreground [overflow-wrap:anywhere] group-hover:text-accent">{contact.name}</span>
                                                    {(contact.jobTitle || contact.company) && <p className="break-words text-sm text-muted [overflow-wrap:anywhere]">
                                                        {[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}
                                                    </p>}
                                                </div>
                                            </div>
                                            <span className="col-start-2 flex min-h-11 items-center justify-center text-muted lg:col-start-4">
                                                <ChevronRight aria-hidden="true" className="size-5" />
                                            </span>
                                        </Link>
                                        <div className="relative col-span-full row-start-2 min-w-0 pl-14 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pl-0" data-testid="contact-phone">
                                            <ContactPhoneDisplay phoneNumbers={contact.phoneNumbers} contactName={contact.name} />
                                        </div>
                                        <div className="relative col-span-full row-start-3 min-w-0 pl-14 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:pl-0" data-testid="contact-recordings">
                                            {contact.totalRecordings > 0 ? <Link href={`/recordings?contact=${contact.id}`} aria-label={`View recordings for ${contact.name}`}
                                                className={`inline-flex min-h-11 items-center text-sm font-medium tabular-nums text-accent ${focusStyle}`}>
                                                {contact.totalRecordings} recording{contact.totalRecordings === 1 ? '' : 's'}
                                            </Link> : <span className="flex min-h-6 items-center text-sm text-muted lg:min-h-11">0 recordings</span>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </>
            ) : (
                <div className="flex flex-col items-center px-4 py-12 text-center sm:py-16">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-secondary text-muted"><Phone aria-hidden="true" className="size-6" /></div>
                    <h2 className="text-xl font-semibold text-foreground">{searchQuery ? 'No contacts found' : 'No contacts yet'}</h2>
                    <p className="mt-2 max-w-md text-sm text-muted">{searchQuery ? 'Try a different name, number, role, or company.' : 'Sync Google Contacts or upload recordings to build your directory.'}</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                        {searchQuery ? <Button variant="secondary" className="min-h-11 lg:min-h-9" onPress={clearSearch}>Clear search</Button> : <>
                            {showGoogleSetup && <ActionLink href="/settings?tab=sources" className="min-h-11">Connect Google Contacts</ActionLink>}
                            <ActionLink href="/upload" variant="secondary" className="min-h-11">Upload recordings</ActionLink>
                        </>}
                    </div>
                </div>
            )}
            {hasContacts && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
                <p className="text-sm tabular-nums text-muted" data-testid="contacts-progress">Showing {loadedCount} of {totalCount} {searchQuery ? 'matches' : 'contacts'}</p>
                {hasError ? <div className="flex flex-wrap items-center gap-3">
                    <span role="status" className="text-sm text-muted">{isLoadMoreError ? 'Could not load more contacts.' : 'Could not refresh contacts.'}</span>
                    <Button size="sm" variant="secondary" className="min-h-11 lg:min-h-9" onPress={retry}>Retry</Button>
                </div> : hasMore && <Button variant="secondary" size="sm" className="min-h-11 lg:min-h-9" onPress={loadMore} isDisabled={isLoadingMore} aria-label="Load more contacts">
                    {isLoadingMore && <Spinner size="sm" aria-hidden="true" />}
                    {isLoadingMore ? 'Loading more…' : 'Load more'}
                </Button>}
            </div>}
            {hasMore && !hasError && !isLoadingMore && <div ref={setSentinelRef} aria-hidden="true" className="h-px" />}
        </Card>
    );
}
