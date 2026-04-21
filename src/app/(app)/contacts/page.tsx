import { ContactsClient } from './contacts-client';
import { Suspense } from 'react';
import { WorkspaceLoadingState } from '@/components/loading-shells';

export default function ContactsPage() {
    return (
        <Suspense fallback={
            <WorkspaceLoadingState
                badge="Contact directory"
                title="Loading contacts"
                description="Preparing your directory, company groups, and linked call history."
            />
        }>
            <ContactsClient />
        </Suspense>
    );
}
