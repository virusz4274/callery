import React, { Suspense } from 'react';
import { RecordingsPage } from '@/components/pages/recordings-page';
import { Metadata } from 'next';
import { WorkspaceLoadingState } from '@/components/loading-shells';

export const metadata: Metadata = {
    title: 'Recordings | Callery',
    description: 'Browse and manage your call recordings.',
};

export default function RecordingsRoute() {
    return (
        <Suspense fallback={
            <WorkspaceLoadingState
                badge="Recordings workspace"
                title="Loading recordings"
                description="Restoring your filters, smart collections, and recent call library."
                listCount={6}
            />
        }>
            <RecordingsPage />
        </Suspense>
    );
}
