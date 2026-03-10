'use client';

import React from 'react';
import { Avatar, Chip, Dropdown, Separator, Spinner } from '@heroui/react';
import { ChevronRight, Mic, MoreVertical, Phone } from 'lucide-react';
import type { Contact } from '@/lib/types';
import { ContactPhoneDisplay } from './contact-phone-display';

type ContactListProps = {
    groupedContacts: Record<string, Contact[]>;
    searchQuery: string;
    hasMore: boolean;
    isLoadingMore: boolean;
    setSentinelRef: (node: HTMLDivElement | null) => void;
    onContactClick: (contactId?: string) => void;
};

export function ContactList({
    groupedContacts,
    searchQuery,
    hasMore,
    isLoadingMore,
    setSentinelRef,
    onContactClick,
}: ContactListProps) {
    return (
        <div className="flex flex-col">
            {Object.keys(groupedContacts).length > 0 ? (
                Object.entries(groupedContacts).map(([letter, contacts]) => (
                    <div key={letter} id={`letter-group-${letter}`} className="pt-0">
                        <h3 className="text-sm font-bold px-6 py-2 text-primary bg-default-50/80 backdrop-blur-sm z-10 w-full sticky top-0 border-y border-default-100/50 uppercase tracking-widest">
                            {letter}
                        </h3>

                        {contacts.map((contact, index) => (
                            <React.Fragment key={contact.id || contact.phoneNumbers?.[0] || index}>
                                <div
                                    className="flex items-center justify-between p-4 px-6 hover:bg-primary/5 transition-colors cursor-pointer group"
                                    onClick={() => onContactClick(contact.id)}
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <Avatar className="w-10 h-10 md:w-12 md:h-12 ring-2 ring-transparent group-hover:ring-primary/20 transition-all shadow-sm">
                                            <Avatar.Fallback className="text-lg bg-gradient-to-br from-primary/20 to-secondary/20 text-foreground">
                                                {contact.name.charAt(0)}
                                            </Avatar.Fallback>
                                        </Avatar>

                                        <div>
                                            <p className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                                                {contact.name}
                                            </p>

                                            {(contact.jobTitle || contact.company) && (
                                                <div className="text-small text-default-500 flex items-center gap-2 mt-0.5">
                                                    {contact.jobTitle && <span>{contact.jobTitle}</span>}
                                                    {contact.jobTitle && contact.company && (
                                                        <span className="text-default-300">•</span>
                                                    )}
                                                    {contact.company && <span>{contact.company}</span>}
                                                </div>
                                            )}

                                            <ContactPhoneDisplay phoneNumbers={contact.phoneNumbers} />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6 flex-shrink-0">
                                        <div className="hidden sm:inline-flex">
                                            <Chip size="sm" variant="soft" color="accent">
                                                <Mic className="w-3 h-3 mr-1" />
                                                {contact.totalRecordings} recordings
                                            </Chip>
                                        </div>

                                        <div onClick={(event) => event.stopPropagation()}>
                                            <Dropdown>
                                                <Dropdown.Trigger className="opacity-0 group-hover:opacity-100 transition-opacity text-default-400 hover:text-foreground p-1.5 rounded-md hover:bg-default-100 cursor-pointer">
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
                                                        <Dropdown.Item id="view">View Recordings</Dropdown.Item>
                                                    </Dropdown.Menu>
                                                </Dropdown.Popover>
                                            </Dropdown>
                                        </div>

                                        <ChevronRight className="h-5 w-5 text-default-300 sm:hidden group-hover:text-primary transition-colors" />
                                    </div>
                                </div>

                                {index < contacts.length - 1 && (
                                    <Separator className="ml-20 w-[calc(100%-5rem)] bg-default-100/50" />
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
                    <p className="text-default-500">
                        {searchQuery ? 'Try putting in a different term.' : 'Your contacts will appear here.'}
                    </p>
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
