import { ObjectId } from 'mongodb';

import { Collections, getMongoDb } from '@/lib/mongodb';

export type SupportMessageDeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface SupportMessageDocument {
    _id: ObjectId;
    firebaseUid: string | null;
    name: string;
    email: string;
    subject: string;
    message: string;
    userAgent?: string;
    ipAddress?: string;
    deliveryStatus: SupportMessageDeliveryStatus;
    deliveryAttempts: number;
    lastDeliveryError?: string | null;
    emailedAt?: Date;
    createdAt: Date;
}

function toObjectId(messageId: string): ObjectId {
    return new ObjectId(messageId);
}

export async function createSupportMessage(
    input: Omit<SupportMessageDocument, '_id'>
): Promise<SupportMessageDocument> {
    const db = await getMongoDb();
    const supportMessage: SupportMessageDocument = {
        _id: new ObjectId(),
        ...input,
    };

    await db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).insertOne(supportMessage);
    return supportMessage;
}

export async function getSupportMessageById(messageId: string): Promise<SupportMessageDocument | null> {
    const db = await getMongoDb();
    return db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).findOne({
        _id: toObjectId(messageId),
    });
}

export async function markSupportMessageQueued(
    messageId: string,
    input?: {
        deliveryAttempts?: number;
        lastDeliveryError?: string | null;
    }
) {
    const db = await getMongoDb();
    const setData: Record<string, unknown> = {
        deliveryStatus: 'queued',
    };
    const unsetData: Record<string, ''> = {};

    if (input?.deliveryAttempts !== undefined) {
        setData.deliveryAttempts = input.deliveryAttempts;
    }

    if (input?.lastDeliveryError === undefined || input.lastDeliveryError === null) {
        unsetData.lastDeliveryError = '';
    } else {
        setData.lastDeliveryError = input.lastDeliveryError;
    }

    await db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).updateOne(
        { _id: toObjectId(messageId) },
        {
            $set: setData,
            ...(Object.keys(unsetData).length > 0 ? { $unset: unsetData } : {}),
        }
    );
}

export async function markSupportMessageSending(messageId: string, deliveryAttempts: number) {
    const db = await getMongoDb();
    await db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).updateOne(
        { _id: toObjectId(messageId) },
        {
            $set: {
                deliveryStatus: 'sending',
                deliveryAttempts,
            },
            $unset: {
                lastDeliveryError: '',
            },
        }
    );
}

export async function markSupportMessageSent(messageId: string, deliveryAttempts: number) {
    const db = await getMongoDb();
    await db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).updateOne(
        { _id: toObjectId(messageId) },
        {
            $set: {
                deliveryStatus: 'sent',
                deliveryAttempts,
                emailedAt: new Date(),
            },
            $unset: {
                lastDeliveryError: '',
            },
        }
    );
}

export async function markSupportMessageFailed(
    messageId: string,
    input: {
        deliveryAttempts: number;
        errorMessage: string;
    }
) {
    const db = await getMongoDb();
    await db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).updateOne(
        { _id: toObjectId(messageId) },
        {
            $set: {
                deliveryStatus: 'failed',
                deliveryAttempts: input.deliveryAttempts,
                lastDeliveryError: input.errorMessage,
            },
        }
    );
}

export async function markSupportMessageSkipped(messageId: string) {
    const db = await getMongoDb();
    await db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).updateOne(
        { _id: toObjectId(messageId) },
        {
            $set: {
                deliveryStatus: 'skipped',
            },
            $unset: {
                lastDeliveryError: '',
            },
        }
    );
}
