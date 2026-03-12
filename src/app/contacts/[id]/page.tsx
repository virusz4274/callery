import { Suspense } from 'react';
import { ContactDetailsPage } from '@/components/pages/contact-details-page';

export default function ContactDetailsRoute() {
    return (
        <Suspense fallback={<div>Loading contact workspace...</div>}>
            <ContactDetailsPage />
        </Suspense>
    );
}
