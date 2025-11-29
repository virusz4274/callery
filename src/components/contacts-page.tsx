
"use client"

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Contact, CallRecording } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, Mic, MoreVertical, Search, ChevronRight } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';

type ContactsPageProps = {
  allContacts: Contact[];
  allRecordings: CallRecording[];
};

export function ContactsPage({ allContacts, allRecordings }: ContactsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const recordingsByContact = useMemo(() => allRecordings.reduce((acc, rec) => {
    if (rec.contactName) {
      const key = rec.contactName;
      if (!acc[key]) {
        acc[key] = 0;
      }
      acc[key]++;
    }
    return acc;
  }, {} as Record<string, number>), [allRecordings]);

  const sortedAndFilteredContacts = useMemo(() => {
    return allContacts
      .filter(contact => contact.name.toLowerCase().includes(searchQuery.toLowerCase()))
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

  return (
    <div className="relative">
      <Card>
        <CardHeader>
          <CardTitle className="mb-2">Contacts</CardTitle>
          <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
                type="search"
                placeholder="Search contacts..."
                className="pl-9 w-full md:w-1/2 lg:w-1/3"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
             />
          </div>
        </CardHeader>
        <CardContent className="p-0 relative">
          <div className="flex flex-col pr-8">
            {Object.keys(groupedContacts).length > 0 ? (
                Object.keys(groupedContacts).map(letter => (
                <div key={letter} id={`letter-group-${letter}`} className="pt-4">
                  <h3 className="text-lg font-semibold px-4 pb-2">{letter}</h3>
                  {groupedContacts[letter].map((contact, index) => {
                    const avatar = PlaceHolderImages[allContacts.findIndex(c => c.phoneNumber === contact.phoneNumber) % PlaceHolderImages.length];
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
                        {index < groupedContacts[letter].length - 1 && <Separator className="ml-16"/>}
                      </React.Fragment>
                    )
                  })}
                </div>
              ))
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <p>No contacts found.</p>
                </div>
            )}
          </div>
          <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-center gap-1 text-xs">
            {alphabet.map(letter => (
              <button
                key={letter}
                onClick={() => handleLetterClick(letter)}
                className="p-1 text-muted-foreground hover:text-foreground font-medium disabled:opacity-50"
                disabled={!groupedContacts[letter]}
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
