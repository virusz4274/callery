import type { Metadata } from 'next';
import { recordingShares } from '@/lib/recording-shares';
import { RecordingContent } from '@/components/recording-view/recording-content';
import { Logo } from '@/components/icons';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import Link from 'next/link';
import { toPublicRecordingContent } from '@/lib/public-recording-content';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

interface SharedPageProps {
    params: Promise<{
        token: string;
    }>;
}

export default async function SharedRecordingPage({ params }: SharedPageProps) {
    const { token } = await params;
    const shared = await recordingShares.resolve(token);
    if (!shared) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4 text-center">
                <Logo alt="Callery" className="w-12 h-12" />
                <h1 className="text-xl font-bold text-default-700">Share link unavailable</h1>
                <p className="text-default-500 max-w-md">
                    This link has expired, was revoked, or is no longer available. Ask the sender for a new link.
                </p>
                <Link href="/" className="text-primary hover:underline mt-4">
                    Go to Callery
                </Link>
            </div>
        );
    }

    const { recording, grant } = shared;
    const recordingContent = toPublicRecordingContent(recording);
    const playbackUrl = `/api/shares/${encodeURIComponent(token)}/audio`;

    return (
        <div className="min-h-screen bg-default-50 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-40 w-full border-b border-default-200/50 bg-background/70 backdrop-blur-xl px-4 md:px-6 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <Logo className="h-8 w-8" />
                    <span className="font-bold text-xl tracking-tight">Callery</span>
                </Link>
                <div className="text-xs font-mono bg-default-100 px-2 py-1 rounded text-default-500">
                    Shared recording
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 md:p-8">
                <div className="bg-background rounded-2xl shadow-sm border border-default-200 flex flex-col md:overflow-hidden md:h-[calc(100vh-140px)]">
                    {/* Recording Header */}
                    <div className="border-b border-default-100 p-4 md:p-6 bg-default-50/30">
                        <h1 className="text-xl font-bold break-words md:text-2xl md:truncate mb-2">
                            {recording.contactName || recording.phoneNumber}
                        </h1>
                        <div className="flex flex-wrap gap-4 text-sm text-default-500">
                             <div className="flex items-center gap-1.5">
                                <span className="font-medium text-default-700">Date:</span>
                                <ClientFormattedDate date={recording.recordedAt} formatString="PPP p" />
                             </div>
                             <div className="flex items-center gap-1.5">
                                <span className="font-medium text-default-700">Duration:</span>
                                <span>{Math.floor(recording.duration / 60)}m {recording.duration % 60}s</span>
                             </div>
                        </div>
                        <p className="mt-3 text-xs text-muted">Available until <ClientFormattedDate date={grant.expiresAt} formatString="PPP p" />.</p>
                    </div>

                    {/* Content Body */}
                    <div className="min-h-0 flex-1 md:overflow-y-auto md:p-6">
                        <RecordingContent
                            recording={recordingContent}
                            playbackUrl={playbackUrl}
                            // Hide transcribe button for public view
                            onTranscribe={undefined}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
