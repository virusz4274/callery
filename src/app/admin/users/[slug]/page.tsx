
import { contacts, recordings } from '@/lib/data/data';
import { invoices } from '@/lib/data/invoice-data';
import { UserDetailsPage } from '@/components/admin/user-details-page';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export default function UserPage({ params, searchParams }: { params: { slug: string }, searchParams: { tab?: string } }) {
    const nameToSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
    const user = contacts.find(c => nameToSlug(c.name) === params.slug);
    const tab = searchParams.tab;

    if (!user) {
        notFound();
    }
    
    // For now, we'll pass all recordings and invoices. In a real app, you'd fetch only the relevant data.
    const userRecordings = recordings.filter(r => r.phoneNumber === user.phoneNumber);

    return (
        <Suspense fallback={<div>Loading user details...</div>}>
            <UserDetailsPage 
                user={user} 
                recordings={userRecordings} 
                invoices={invoices}
                defaultTab={tab}
            />
        </Suspense>
    );
}

// Optional: Generate static paths for users if you want to pre-render these pages
export async function generateStaticParams() {
    return contacts.map(contact => ({
        slug: contact.name.toLowerCase().replace(/\s+/g, '-'),
    }));
}
