'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ContactsWrapper = dynamic(() => import('@/components/pages/contacts-wrapper').then(mod => mod.ContactsWrapper), {
  ssr: false,
  loading: () => <div className="p-4">Loading interface...</div>
});

export function ContactsClient() {
  return <ContactsWrapper />;
}
