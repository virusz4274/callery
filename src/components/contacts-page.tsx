"use client"

import React from 'react';
import type { Contact, CallRecording } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, Mic, MoreVertical } from 'lucide-react';
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

type ContactsPageProps = {
  allContacts: Contact[];
  allRecordings: CallRecording[];
};

export function ContactsPage({ allContacts, allRecordings }: ContactsPageProps) {
  const recordingsByContact = allRecordings.reduce((acc, rec) => {
    if (rec.contactName) {
      const key = rec.contactName;
      if (!acc[key]) {
        acc[key] = 0;
      }
      acc[key]++;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col">
          {allContacts.map((contact, index) => {
            const avatar = PlaceHolderImages[index % PlaceHolderImages.length];
            return (
              <React.Fragment key={contact.phoneNumber}>
                <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
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
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                           </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem>View Recordings</DropdownMenuItem>
                           <DropdownMenuItem>Edit Contact</DropdownMenuItem>
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </div>
                </div>
                {index < allContacts.length - 1 && <Separator />}
              </React.Fragment>
            )
          })}
        </div>
      </CardContent>
    </Card>
  );
}
