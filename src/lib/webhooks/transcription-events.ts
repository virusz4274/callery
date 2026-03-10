import { MongoServerError } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';

type WebhookEventStatus = 'processing' | 'processed' | 'failed';
type WebhookProvider = 'elevenlabs' | 'soniox';

type TranscriptionWebhookEventDoc = {
    _id: string;
    provider: WebhookProvider;
    recordingId: string;
    externalTranscriptionId: string;
    deliveryStatus: string;
    status: WebhookEventStatus;
    attempts: number;
    receivedAt: Date;
    updatedAt: Date;
    processedAt?: Date;
    lastError?: string | null;
};

const WEBHOOK_PROCESSING_STALE_MS = 10 * 60 * 1000;

function isDuplicateKeyError(error: unknown): boolean {
    if (error instanceof MongoServerError) {
        return error.code === 11000;
    }

    return error instanceof Error && error.message.includes('E11000');
}

export async function claimTranscriptionWebhookEvent(input: {
    eventId: string;
    provider: WebhookProvider;
    recordingId: string;
    externalTranscriptionId: string;
    deliveryStatus: string;
}): Promise<'claimed' | 'already_processed' | 'in_progress'> {
    const db = await getMongoDb();
    const events = db.collection<TranscriptionWebhookEventDoc>(Collections.TRANSCRIPTION_WEBHOOK_EVENTS);
    const now = new Date();

    try {
        const result = await events.updateOne(
            {
                _id: input.eventId,
                $or: [{ status: { $exists: false } }, { status: 'failed' }],
            },
            {
                $setOnInsert: {
                    provider: input.provider,
                    recordingId: input.recordingId,
                    externalTranscriptionId: input.externalTranscriptionId,
                    deliveryStatus: input.deliveryStatus,
                    receivedAt: now,
                },
                $set: {
                    provider: input.provider,
                    recordingId: input.recordingId,
                    externalTranscriptionId: input.externalTranscriptionId,
                    deliveryStatus: input.deliveryStatus,
                    status: 'processing',
                    updatedAt: now,
                    lastError: null,
                },
                $inc: {
                    attempts: 1,
                },
            },
            { upsert: true }
        );

        if (result.matchedCount > 0 || result.upsertedCount > 0) {
            return 'claimed';
        }

        return 'in_progress';
    } catch (error) {
        if (!isDuplicateKeyError(error)) {
            throw error;
        }

        const existing = await events.findOne({ _id: input.eventId });
        if (existing?.status === 'processed') {
            return 'already_processed';
        }

        if (existing?.status === 'failed') {
            const retry = await events.updateOne(
                { _id: input.eventId, status: 'failed' },
                {
                    $set: {
                        provider: input.provider,
                        recordingId: input.recordingId,
                        externalTranscriptionId: input.externalTranscriptionId,
                        deliveryStatus: input.deliveryStatus,
                        status: 'processing',
                        updatedAt: now,
                        lastError: null,
                    },
                    $inc: { attempts: 1 },
                }
            );
            if (retry.modifiedCount > 0) {
                return 'claimed';
            }
        }

        if (existing?.status === 'processing' && now.getTime() - existing.updatedAt.getTime() > WEBHOOK_PROCESSING_STALE_MS) {
            const takeover = await events.updateOne(
                { _id: input.eventId, status: 'processing', updatedAt: existing.updatedAt },
                {
                    $set: {
                        provider: input.provider,
                        recordingId: input.recordingId,
                        externalTranscriptionId: input.externalTranscriptionId,
                        deliveryStatus: input.deliveryStatus,
                        status: 'processing',
                        updatedAt: now,
                        lastError: null,
                    },
                    $inc: { attempts: 1 },
                }
            );
            if (takeover.modifiedCount > 0) {
                return 'claimed';
            }
        }

        return 'in_progress';
    }
}

export async function markTranscriptionWebhookProcessed(eventId: string) {
    const db = await getMongoDb();
    await db.collection<TranscriptionWebhookEventDoc>(Collections.TRANSCRIPTION_WEBHOOK_EVENTS).updateOne(
        { _id: eventId },
        {
            $set: {
                status: 'processed',
                processedAt: new Date(),
                updatedAt: new Date(),
                lastError: null,
            },
        }
    );
}

export async function markTranscriptionWebhookFailed(eventId: string, errorMessage: string) {
    const db = await getMongoDb();
    await db.collection<TranscriptionWebhookEventDoc>(Collections.TRANSCRIPTION_WEBHOOK_EVENTS).updateOne(
        { _id: eventId },
        {
            $set: {
                status: 'failed',
                lastError: errorMessage,
                updatedAt: new Date(),
            },
        }
    );
}
