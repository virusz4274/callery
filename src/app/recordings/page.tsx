import React, { Suspense } from 'react';
import { RecordingsPage } from '@/components/pages/recordings-page';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Recordings | VoSift',
    description: 'Browse and manage your call recordings.',
};

export default function RecordingsRoute() {
    return (
        <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
            <RecordingsPage />
        </Suspense>
    );
}
