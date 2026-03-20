'use client';

import React from 'react';
import Link from 'next/link';
import { Avatar, Button, Chip, Dropdown, Separator, Spinner } from '@heroui/react';
import { ChevronRight, Mic, MoreVertical, Phone } from 'lucide-react';
import type { Contact } from '@/lib/types';
import { ContactPhoneDisplay } from './contact-phone-display';

type ContactListProps = {
    groupedContacts: Record<string, Contact[]>;
    searchQuery: string;
    hasMore: boolean;
    isLoadingMore: boolean;
    showGoogleSetup: boolean;
    setSentinelRef: (node: HTMLDivElement | null) => void;
    onContactClick: (contactId?: string) => void;
};

export function ContactList({
    groupedContacts,
    searchQuery,
    hasMore,
    isLoadingMore,
    showGoogleSetup,
    setSentinelRef,
    onContactClick,
}: ContactListProps) {
    return (
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-default-200/80 bg-background/95 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
            {Object.keys(groupedContacts).length > 0 ? (
                Object.entries(groupedContacts).map(([letter, contacts]) => (
                    <div key={letter} id={`letter-group-${letter}`} className="pt-0">
                        <h3 className="sticky top-0 z-10 w-full border-y border-default-100/50 bg-default-50/90 px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary backdrop-blur-sm sm:px-6">
                            {letter}
                        </h3>

                        {contacts.map((contact, index) => (
                            <React.Fragment key={contact.id || contact.phoneNumbers?.[0] || index}>
                                <div
                                    className="group flex min-w-0 cursor-pointer items-start justify-between gap-3 px-4 py-5 transition-colors hover:bg-primary/5 sm:items-center sm:gap-4 sm:px-6"
                                    onClick={() => onContactClick(contact.id)}
                                >
                                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                                        <Avatar className="h-11 w-11 ring-2 ring-transparent shadow-sm transition-all group-hover:ring-primary/20 md:h-12 md:w-12">
                                            <Avatar.Fallback className="text-lg bg-gradient-to-br from-primary/20 to-secondary/20 text-foreground">
                                                {contact.name.charAt(0)}
                                            </Avatar.Fallback>
                                        </Avatar>

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary sm:text-lg">
                                                {contact.name}
                                            </p>

                                            {(contact.jobTitle || contact.company) && (
                                                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-small text-default-500">
                                                    {contact.jobTitle && <span>{contact.jobTitle}</span>}
                                                    {contact.jobTitle && contact.company && (
                                                        <span className="text-default-300">•</span>
                                                    )}
                                                    {contact.company && <span>{contact.company}</span>}
                                                </div>
                                            )}

                                            <ContactPhoneDisplay phoneNumbers={contact.phoneNumbers} />

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Chip size="sm" variant="soft" color="accent">
                                                    <Mic className="mr-1 h-3 w-3" />
                                                    {contact.totalRecordings} recording{contact.totalRecordings === 1 ? '' : 's'}
                                                </Chip>
                                                {contact.company && (
                                                    <Chip size="sm" variant="soft" color="default">
                                                        {contact.company}
                                                    </Chip>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">
                                        <div className="hidden sm:block" onClick={(event) => event.stopPropagation()}>
                                            <Dropdown>
                                                <Dropdown.Trigger className="rounded-md p-1.5 text-default-400 transition-opacity hover:bg-default-100 hover:text-foreground cursor-pointer md:opacity-0 md:group-hover:opacity-100">
                                                    <MoreVertical className="h-4 w-4" />
                                                    <span className="sr-only">Actions</span>
                                                </Dropdown.Trigger>
                                                <Dropdown.Popover>
                                                    <Dropdown.Menu
                                                        aria-label="Contact actions"
                                                        onAction={(key) => {
                                                            if (key === 'view') {
                                                                onContactClick(contact.id);
                                                            }
                                                        }}
                                                    >
                                                        <Dropdown.Item id="view">Open Contact Workspace</Dropdown.Item>
                                                    </Dropdown.Menu>
                                                </Dropdown.Popover>
                                            </Dropdown>
                                        </div>

                                        <ChevronRight className="h-5 w-5 text-default-300 transition-colors group-hover:text-primary" />
                                    </div>
                                </div>

                                {index < contacts.length - 1 && (
                                    <Separator className="mx-4 bg-default-100/50 sm:mx-6" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                ))
            ) : (
                <div className="flex flex-col items-center justify-center py-32 text-default-400">
                    <div className="w-20 h-20 rounded-full bg-default-50 flex items-center justify-center mb-6 shadow-sm">
                        <Phone className="w-10 h-10 text-default-300" />
                    </div>
                    <p className="font-semibold text-xl text-foreground mb-2">
                        {searchQuery ? 'No contacts found' : 'No contacts yet'}
                    </p>
                    <p className="text-center text-default-500">
                        {searchQuery
                            ? 'Try putting in a different term.'
                            : 'Contacts appear here after Google Contacts sync or once recordings start linking people in your workspace.'}
                    </p>
                    {!searchQuery && (
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            {showGoogleSetup ? (
                                <Link href="/settings?tab=sources">
                                    <Button className="rounded-full">
                                        Connect Google Contacts
                                    </Button>
                                </Link>
                            ) : null}
                            <Link href="/upload">
                                <Button variant="secondary" className="rounded-full">
                                    Upload recordings
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            )}

            {hasMore && (
                <>
                    {!isLoadingMore && <div ref={setSentinelRef} className="py-4 w-full flex justify-center min-h-[40px]" />}
                    {isLoadingMore && (
                        <div className="py-4 w-full flex justify-center min-h-[40px]">
                            <Spinner size="sm" color="current" className="text-default-400" />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
