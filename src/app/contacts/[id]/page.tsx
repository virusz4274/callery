import { Suspense } from 'react';
import { ContactDetailsPage } from '@/components/pages/contact-details-page';
import { WorkspaceLoadingState } from '@/components/loading-shells';

export default function ContactDetailsRoute() {
    return (
        <Suspense fallback={
            <WorkspaceLoadingState
                badge="Contact workspace"
                title="Loading contact view"
                description="Pulling profile details, recent calls, and conversation history for this contact."
                statsCount={3}
                listCount={5}
            />
        }>
            <ContactDetailsPage />
        </Suspense>
    );
}
