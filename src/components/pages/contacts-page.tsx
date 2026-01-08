
"use client"

import React, { useMemo, useEffect, useRef } from 'react';
import type { Contact } from '@/lib/types';
import { Card, Avatar, Button, Dropdown, Separator, Spinner, Chip, Tooltip } from '@heroui/react';
import { Phone, Mic, MoreVertical, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

type ContactsPageProps = {
  allContacts: Contact[];
  loadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
};

export function ContactsPage({ allContacts, loadMore, hasMore, totalCount = 0 }: ContactsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  const sortedAndFilteredContacts = useMemo(() => {
    if (!allContacts) return [];
    const searchLower = searchQuery.toLowerCase();
    return allContacts
      .filter(contact =>
        contact.name.toLowerCase().includes(searchLower) ||
        contact.phoneNumbers?.some(p => p.includes(searchLower)) ||
        contact.company?.toLowerCase().includes(searchLower) ||
        contact.jobTitle?.toLowerCase().includes(searchLower)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allContacts, searchQuery]);

  const groupedContacts = useMemo(() => {
    return sortedAndFilteredContacts.reduce((acc, contact) => {
      const firstLetter = contact.name[0]?.toUpperCase() || '#';
      if (!acc[firstLetter]) {
        acc[firstLetter] = [];
      }
      acc[firstLetter].push(contact);
      return acc;
    }, {} as Record<string, Contact[]>);
  }, [sortedAndFilteredContacts]);



  const handleContactClick = (contactName: string) => {
    router.push(`/?filterType=contact&filterValue=${encodeURIComponent(contactName)}`);
  }

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadMore || !hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    }, { threshold: 0.1 });

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div className="relative space-y-8">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-0 right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
          Contacts
        </h2>
        <p className="text-default-500 text-lg">
          Manage and view your contact directory
        </p>
      </div>

      <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl transition-all duration-300">
        <Card.Header className="flex flex-col items-start gap-1 pb-4 pt-6 px-6 border-b border-default-100/50">
          <div className="flex justify-between w-full items-center">
            <div className="text-sm font-medium text-default-500 uppercase tracking-wider">
              Directory
            </div>
            <div className="text-sm text-default-400 bg-default-100/50 px-2 py-1 rounded-md">
              {searchQuery ? sortedAndFilteredContacts.length : (totalCount || sortedAndFilteredContacts.length)} Contacts
            </div>
          </div>
        </Card.Header>
        <Card.Content className="p-0 relative overflow-hidden min-h-[400px]">
          <div className="flex flex-col pr-8">
            {Object.keys(groupedContacts).length > 0 ? (
              Object.entries(groupedContacts).map(([letter, contacts]) => (
                <div key={letter} id={`letter-group-${letter}`} className="pt-0">
                  <h3 className="text-sm font-bold px-6 py-2 text-primary bg-default-50/80 backdrop-blur-sm z-10 w-full sticky top-0 border-y border-default-100/50 uppercase tracking-widest">{letter}</h3>
                  {contacts.map((contact, index) => {
                    return (
                      <React.Fragment key={contact.id || contact.phoneNumbers?.[0] || index}>
                        <div
                          className="flex items-center justify-between p-4 px-6 hover:bg-primary/5 transition-colors cursor-pointer group"
                          onClick={() => handleContactClick(contact.name)}
                        >
                          <div className="flex items-center gap-4">
                            <Avatar className="w-12 h-12 ring-2 ring-transparent group-hover:ring-primary/20 transition-all shadow-sm">
                              <Avatar.Fallback className="text-lg bg-gradient-to-br from-primary/20 to-secondary/20 text-foreground">{contact.name.charAt(0)}</Avatar.Fallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">{contact.name}</p>

                              {(contact.jobTitle || contact.company) && (
                                <div className="text-small text-default-500 flex items-center gap-2 mt-0.5">
                                  {contact.jobTitle && <span>{contact.jobTitle}</span>}
                                  {contact.jobTitle && contact.company && <span className="text-default-300">•</span>}
                                  {contact.company && <span>{contact.company}</span>}
                                </div>
                              )}

                              <div className="flex items-center gap-2 mt-2">
                                {contact.phoneNumbers && contact.phoneNumbers.length > 0 && (
                                  <>
                                    <Chip size="sm" variant="soft" color="default">
                                      <Phone className="w-3 h-3 mr-1" />
                                      {contact.phoneNumbers[0]}
                                    </Chip>

                                    {contact.phoneNumbers.length > 1 && (
                                      <Tooltip>
                                        <Tooltip.Trigger>
                                          <Chip size="sm" variant="soft" className="cursor-help">
                                            +{contact.phoneNumbers.length - 1} more
                                          </Chip>
                                        </Tooltip.Trigger>
                                        <Tooltip.Content className="p-0">
                                          <div className="px-3 py-2">
                                            <div className="text-small font-bold mb-1">Additional Numbers</div>
                                            <div className="flex flex-col gap-1">
                                              {contact.phoneNumbers.slice(1).map((num, i) => (
                                                <div key={i} className="text-xs text-default-500 font-mono">{num}</div>
                                              ))}
                                            </div>
                                          </div>
                                        </Tooltip.Content>
                                      </Tooltip>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="hidden sm:inline-flex">
                              <Chip size="sm" variant="soft" color="accent">
                                <Mic className="w-3 h-3 mr-1" />
                                {contact.totalRecordings} recordings
                              </Chip>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              <Dropdown>
                                <Button variant="ghost" isIconOnly size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-default-400 hover:text-foreground">
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                                <Dropdown.Popover>
                                  <Dropdown.Menu aria-label="Contact actions" onAction={(key) => {
                                    if (key === 'view') handleContactClick(contact.name);
                                  }}>
                                    <Dropdown.Item key="view">View Recordings</Dropdown.Item>
                                    <Dropdown.Item key="edit">Edit Contact</Dropdown.Item>
                                  </Dropdown.Menu>
                                </Dropdown.Popover>
                              </Dropdown>
                            </div>
                            <ChevronRight className="h-5 w-5 text-default-300 sm:hidden group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                        {index < contacts.length - 1 && <Separator className="ml-20 w-[calc(100%-5rem)] bg-default-100/50" />}
                      </React.Fragment>
                    )
                  })}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-default-400">
                <div className="w-20 h-20 rounded-full bg-default-50 flex items-center justify-center mb-6 shadow-sm">
                  <Phone className="w-10 h-10 text-default-300" />
                </div>
                <p className="font-semibold text-xl text-foreground mb-2">{searchQuery ? "No contacts found" : "No contacts yet"}</p>
                <p className="text-default-500">{searchQuery ? "Try putting in a different term." : "Your contacts will appear here."}</p>
              </div>
            )}

            {/* Sentinel for Infinite Scroll */}
            <div ref={sentinelRef} className="py-4 w-full flex justify-center min-h-[40px]">
              {hasMore && <Spinner size="sm" color="current" className="text-default-400" />}
            </div>
          </div>

        </Card.Content>
      </Card>
    </div>
  );
}
