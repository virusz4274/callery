import { ContactsClient } from './contacts-client';
import { connection } from 'next/server';
import { Suspense } from 'react';

export default async function ContactsPage() {
    await connection();
    return (
        <Suspense fallback={<div>Loading contacts...</div>}>
            <ContactsClient />
        </Suspense>
    );
}
