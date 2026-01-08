import { NextRequest, NextResponse, after } from 'next/server';
import { getRecordingById, updateRecording } from '@/lib/db/recordings';
import { getSignedR2Url } from '@/lib/r2';
import { transcribeAudio, deleteTranscript } from '@/services/elevenlabs';
import { getUserFromRequest } from '@/lib/auth-utils';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { incrementTranscriptionUsed } from '@/lib/db/users';
import { generateSummary, generateTransliteration } from '@/services/llm';

import { generateEmbedding } from '@/lib/embeddings';
import { checkUserAccess } from '@/lib/access-control';
import { findUserByFirebaseUid } from '@/lib/db/users';

// export const maxDuration = parseInt(process.env.TRANSCRIPTION_MAX_DURATION_SECONDS || '300'); // 5 minutes timeout for Vercel/Next.js functions
export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate
        const uid = await getUserFromRequest(req);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const access = checkUserAccess(user);
        if (!access.allowed) {
            return NextResponse.json({ error: access.reason }, { status: 403 });
        }

        const body = await req.json();
        const { recordingId } = body;

        if (!recordingId) {
            return NextResponse.json({ error: 'Missing recordingId' }, { status: 400 });
        }

        // 2. Get Recording
        const recording = await getRecordingById(recordingId, uid);
        if (!recording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        // 5. Trigger Background Transcription
        // We use after() to run this in the background, returning immediately to the client.
        after(async () => {
            try {
                const fileUrl = await getSignedR2Url(recording.r2Key, 1800);
                const result = await transcribeAudio(fileUrl);

                // Parallelize LLM operations
                const [summary, transliteratedSegments] = await Promise.all([
                    generateSummary(result.text, result.languageCode),
                    generateTransliteration(result.segments, result.languageCode)
                ]);

                // Generate embedding from summary
                const summaryEmbedding = summary ? await generateEmbedding(summary) : [];

                // Save Result
                await updateRecording(recordingId, uid, {
                    transcriptionStatus: 'completed',
                    fullTranscript: transliteratedSegments, // This now includes transliteratedText
                    languageCode: result.languageCode,
                    summary,
                    summaryEmbedding,
                });

                // Calculate and record billed usage
                const billedDuration = calculateBilledDuration(recording.duration);
                await incrementTranscriptionUsed(uid, billedDuration);

                // Delete from ElevenLabs
                try {
                    await deleteTranscript(result.transcriptionId);
                } catch (deleteError) {
                    console.error('Failed to delete transcript from ElevenLabs:', deleteError);
                }
            } catch (error) {
                console.error('Background transcription error:', error);
                await updateRecording(recordingId, uid, {
                    transcriptionStatus: 'failed',
                });
            }
        });

        // Return "Processing" status immediately
        return NextResponse.json({
            success: true,
        });

    } catch (error) {
        console.error('Transcription start error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
