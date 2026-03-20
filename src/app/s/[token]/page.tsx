import { notFound } from 'next/navigation';
import { verifyShareToken } from '@/lib/sharing';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getSignedR2Url } from '@/lib/r2';
import { RecordingContent } from '@/components/recording-view/recording-content';
import { Logo } from '@/components/icons';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import Link from 'next/link';
import { Recording } from '@/lib/db/types';

interface SharedPageProps {
    params: Promise<{
        token: string;
    }>;
}

export default async function SharedRecordingPage({ params }: SharedPageProps) {
    const { token } = await params;

    // 1. Verify Token
    const payload = await verifyShareToken(token);
    if (!payload) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4 text-center">
                <Logo className="w-12 h-12 text-default-300" />
                <h1 className="text-xl font-bold text-default-700">Link Expired or Invalid</h1>
                <p className="text-default-500 max-w-md">
                    This shared link is no longer valid. Please ask the sender to generate a new one.
                </p>
                <Link href="/" className="text-primary hover:underline mt-4">
                    Go to vosift
                </Link>
            </div>
        );
    }

    // 2. Fetch Recording
    const db = await getMongoDb();
    const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({
        _id: new ObjectId(payload.recordingId)
    });

    if (!recording) {
        notFound();
    }

    // 3. Generate Signed URL for Playback
    let playbackUrl: string | null = null;
    try {
        if (typeof payload.clipStartSeconds !== 'number' && typeof payload.clipEndSeconds !== 'number') {
            playbackUrl = await getSignedR2Url(recording.r2Key, 3600);
        }
    } catch (e) {
        console.error('Failed to generate playback URL for shared page', e);
    }

    // 4. Convert to Client Type (RecordingResponse)
    // We need to cast or convert because the component expects specific types
    // reusing the converter from db
    const recordingResponse = {
        ...recording,
        id: recording._id.toString(),
    } as any;

    return (
        <div className="min-h-screen bg-default-50 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-40 w-full border-b border-default-200/50 bg-background/70 backdrop-blur-xl px-4 md:px-6 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <Logo className="h-8 w-8 text-primary" />
                    <span className="font-bold text-xl tracking-tight">vosift</span>
                </Link>
                <div className="text-xs font-mono bg-default-100 px-2 py-1 rounded text-default-500">
                    SHARED VIEW
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 md:p-8">
                <div className="bg-background rounded-2xl shadow-sm border border-default-200 overflow-hidden flex flex-col h-[calc(100vh-140px)]">
                    {/* Recording Header */}
                    <div className="border-b border-default-100 p-6 bg-default-50/30">
                        <h1 className="text-2xl font-bold truncate mb-2">
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
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 overflow-hidden p-6">
                        <RecordingContent 
                            recording={recordingResponse} 
                            playbackUrl={playbackUrl}
                            clipStartSeconds={payload.clipStartSeconds}
                            clipEndSeconds={payload.clipEndSeconds}
                            isClipAudioRestricted={
                                typeof payload.clipStartSeconds === 'number' ||
                                typeof payload.clipEndSeconds === 'number'
                            }
                            // Hide transcribe button for public view
                            onTranscribe={undefined} 
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
