"use client"

import React from 'react';
import type { Contact, CallRecording } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, Mail, Mic } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';

type ContactsPageProps = {
  allContacts: Contact[];
  allRecordings: CallRecording[];
};

export function ContactsPage({ allContacts, allRecordings }: ContactsPageProps) {
  const recordingsByContact = allRecordings.reduce((acc, rec) => {
    const key = rec.phoneNumber;
    if (!acc[key]) {
      acc[key] = 0;
    }
    acc[key]++;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Contacts</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {allContacts.map((contact, index) => {
          const avatar = PlaceHolderImages[index % PlaceHolderImages.length];
          return (
          <Card key={contact.phoneNumber}>
            <CardHeader className="items-center">
              <Avatar className="w-24 h-24 mb-4">
                {avatar && <Image src={avatar.imageUrl} alt={contact.name} width={96} height={96} data-ai-hint={avatar.imageHint} className="rounded-full object-cover"/>}
                <AvatarFallback className="text-4xl">{contact.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <CardTitle>{contact.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4"/>
                <span>{contact.phoneNumber}</span>
              </div>
               <div className="flex items-center justify-center gap-2 text-muted-foreground mt-2">
                <Mic className="w-4 h-4"/>
                <span>{recordingsByContact[contact.phoneNumber] || 0} recordings</span>
              </div>
            </CardContent>
          </Card>
        )})}
      </div>
    </div>
  );
}
