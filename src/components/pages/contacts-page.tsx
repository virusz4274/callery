
"use client"

import React, { useMemo } from 'react';
import type { Contact, CallRecording } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, Mic, MoreVertical, ChevronRight } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';

export function ContactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const { user } = useUser();
  const firestore = useFirestore();

  const contactsQuery = useMemoFirebase(() => 
    user ? query(collection(firestore, 'users', user.uid, 'contacts')) : null, 
    [user, firestore]
  );
  const recordingsQuery = useMemoFirebase(() => 
    user ? query(collection(firestore, 'users', user.uid, 'recordings')) : null, 
    [user, firestore]
  );

  const { data: allContacts, isLoading: isLoadingContacts } = useCollection<Contact>(contactsQuery);
  const { data: allRecordings, isLoading: isLoadingRecordings } = useCollection<CallRecording>(recordingsQuery);

  const recordingsByContact = useMemo(() => {
    if (!allRecordings) return {};
    return allRecordings.reduce((acc, rec) => {
      if (rec.contactName) {
        const key = rec.contactName;
        if (!acc[key]) {
          acc[key] = 0;
        }
        acc[key]++;
      }
      return acc;
    }, {} as Record<string, number>);
  }, [allRecordings]);

  const sortedAndFilteredContacts = useMemo(() => {
    if (!allContacts) return [];
    const searchLower = searchQuery.toLowerCase();
    return allContacts
      .filter(contact => 
        contact.name.toLowerCase().includes(searchLower) ||
        contact.phoneNumber.includes(searchLower)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allContacts, searchQuery]);

  const groupedContacts = useMemo(() => {
    return sortedAndFilteredContacts.reduce((acc, contact) => {
      const firstLetter = contact.name[0].toUpperCase();
      if (!acc[firstLetter]) {
        acc[firstLetter] = [];
      }
      acc[firstLetter].push(contact);
      return acc;
    }, {} as Record<string, Contact[]>);
  }, [sortedAndFilteredContacts]);
  
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');

  const handleLetterClick = (letter: string) => {
    const element = document.getElementById(`letter-group-${letter}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleContactClick = (contactName: string) => {
    router.push(`/?filterType=contact&filterValue=${encodeURIComponent(contactName)}`);
  }
  
  const isLoading = isLoadingContacts || isLoadingRecordings;

  return (
    <div className="relative">
      <Card>
        <CardHeader>
          <CardTitle className="mb-2">Contacts</CardTitle>
           <div className="text-sm text-muted-foreground">
            {isLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              `Showing ${sortedAndFilteredContacts.length} of ${allContacts?.length || 0} contacts.`
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 relative">
          <div className="flex flex-col pr-8">
            {isLoading ? (
                <div className="space-y-4 p-4">
                    <div className="flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                </div>
            ) : Object.keys(groupedContacts).length > 0 ? (
                Object.entries(groupedContacts).map(([letter, contacts]) => (
                <div key={letter} id={`letter-group-${letter}`} className="pt-4">
                  <h3 className="text-lg font-semibold px-4 pb-2">{letter}</h3>
                  {contacts.map((contact, index) => {
                    const avatar = allContacts ? PlaceHolderImages[allContacts.findIndex(c => c.phoneNumber === contact.phoneNumber) % PlaceHolderImages.length] : undefined;
                    return (
                      <React.Fragment key={contact.phoneNumber}>
                        <div 
                          className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => handleContactClick(contact.name)}
                        >
                          <div className="flex items-center gap-4">
                            <Avatar className="w-10 h-10">
                              {avatar && <Image src={avatar.imageUrl} alt={contact.name} width={40} height={40} data-ai-hint={avatar.imageHint} className="rounded-full object-cover"/>}
                              <AvatarFallback>{contact.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{contact.name}</p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="w-3 h-3"/>
                                <span>{contact.phoneNumber}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                             <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                                <Mic className="w-4 h-4"/>
                                <span>{recordingsByContact[contact.name] || 0} recordings</span>
                             </div>
                             <DropdownMenu onOpenChange={(e) => e.stopPropagation()}>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                   <Button variant="ghost" size="icon">
                                      <MoreVertical className="h-4 w-4" />
                                      <span className="sr-only">Actions</span>
                                   </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                   <DropdownMenuItem onClick={() => handleContactClick(contact.name)}>View Recordings</DropdownMenuItem>
                                   <DropdownMenuItem>Edit Contact</DropdownMenuItem>
                                </DropdownMenuContent>
                             </DropdownMenu>
                              <ChevronRight className="h-4 w-4 text-muted-foreground sm:hidden" />
                          </div>
                        </div>
                        {index < contacts.length - 1 && <Separator className="ml-16"/>}
                      </React.Fragment>
                    )
                  })}
                </div>
              ))
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <p>{searchQuery ? "No contacts found matching your search." : "You don't have any contacts yet."}</p>
                </div>
            )}
          </div>
          <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-center gap-1 text-xs">
            {alphabet.map(letter => (
              <button
                key={letter}
                onClick={() => handleLetterClick(letter)}
                className="p-1 text-muted-foreground hover:text-foreground font-medium disabled:opacity-50"
                disabled={isLoading || !groupedContacts[letter]}
              >
                {letter}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
