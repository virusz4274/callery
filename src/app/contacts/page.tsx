import { ContactsClient } from './contacts-client';
import { Suspense } from 'react';

export default function ContactsPage() {
    return (
        <Suspense fallback={<div>Loading contacts...</div>}>
            <ContactsClient />
        </Suspense>
    );
}
