import type { Db } from 'mongodb';

type CollectionsMap = {
    USERS: string;
    RECORDINGS: string;
    CONTACTS: string;
    PLANS: string;
    EXPORT_JOBS: string;
    ADMIN_LOGS: string;
    NOTIFICATIONS: string;
    SUPPORT_MESSAGES: string;
    STRIPE_WEBHOOK_EVENTS: string;
    TRANSCRIPTION_WEBHOOK_EVENTS: string;
};

type IndexTask = {
    label: string;
    collection: string;
    indexes: Array<Record<string, unknown>>;
    errorMessage: string;
};

export async function createCoreIndexes(db: Db, collections: CollectionsMap): Promise<void> {
    const tasks: IndexTask[] = [
        {
            label: 'Users',
            collection: collections.USERS,
            indexes: [
                { key: { firebaseUid: 1 }, unique: true, name: 'firebaseUid_unique' },
                { key: { email: 1 }, name: 'email' },
            ],
            errorMessage: '⚠️ Users index creation failed:',
        },
        {
            label: 'Recordings',
            collection: collections.RECORDINGS,
            indexes: [
                { key: { firebaseUid: 1, recordedAt: -1 }, name: 'firebaseUid_recordedAt' },
                { key: { firebaseUid: 1, contactId: 1 }, name: 'firebaseUid_contactId' },
                { key: { r2Key: 1 }, unique: true, name: 'r2Key_unique' },
                { key: { firebaseUid: 1, isArchived: 1 }, name: 'firebaseUid_isArchived' },
            ],
            errorMessage: '⚠️ Recordings index creation failed:',
        },
        {
            label: 'Contacts',
            collection: collections.CONTACTS,
            indexes: [
                { key: { firebaseUid: 1, phoneNumbers: 1 }, unique: true, name: 'firebaseUid_phoneNumbers_unique' },
                { key: { firebaseUid: 1, name: 1 }, name: 'firebaseUid_name' },
            ],
            errorMessage: '⚠️ Contacts index creation failed (likely duplicates):',
        },
        {
            label: 'Plans',
            collection: collections.PLANS,
            indexes: [{ key: { name: 1 }, unique: true, name: 'name_unique' }],
            errorMessage: '⚠️ Plans index creation failed:',
        },
        {
            label: 'Admin Logs',
            collection: collections.ADMIN_LOGS,
            indexes: [
                { key: { createdAt: -1 }, name: 'createdAt_desc' },
                { key: { adminId: 1 }, name: 'adminId' },
                { key: { action: 1 }, name: 'action' },
            ],
            errorMessage: '⚠️ Admin Logs index creation failed:',
        },
        {
            label: 'Notifications',
            collection: collections.NOTIFICATIONS,
            indexes: [
                { key: { userId: 1, isRead: 1, createdAt: -1 }, name: 'userId_isRead_createdAt' },
                { key: { userId: 1, createdAt: -1 }, name: 'userId_createdAt' },
            ],
            errorMessage: '⚠️ Notifications index creation failed:',
        },
        {
            label: 'Support Messages',
            collection: collections.SUPPORT_MESSAGES,
            indexes: [
                { key: { firebaseUid: 1, createdAt: -1 }, name: 'firebaseUid_createdAt' },
                { key: { email: 1, createdAt: -1 }, name: 'email_createdAt' },
            ],
            errorMessage: '⚠️ Support messages index creation failed:',
        },
        {
            label: 'Export Jobs',
            collection: collections.EXPORT_JOBS,
            indexes: [
                { key: { firebaseUid: 1, createdAt: -1 }, name: 'firebaseUid_createdAt' },
                { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
            ],
            errorMessage: '⚠️ Export jobs index creation failed:',
        },
        {
            label: 'Stripe Webhook Events',
            collection: collections.STRIPE_WEBHOOK_EVENTS,
            indexes: [
                { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
                // Keep dedupe history for 90 days; _id is the Stripe event ID.
                { key: { receivedAt: 1 }, name: 'receivedAt_ttl_90d', expireAfterSeconds: 90 * 24 * 60 * 60 },
            ],
            errorMessage: '⚠️ Stripe webhook events index creation failed:',
        },
        {
            label: 'Transcription Webhook Events',
            collection: collections.TRANSCRIPTION_WEBHOOK_EVENTS,
            indexes: [
                { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
                { key: { recordingId: 1, provider: 1, updatedAt: -1 }, name: 'recordingId_provider_updatedAt' },
                // Keep dedupe history for 90 days.
                { key: { receivedAt: 1 }, name: 'receivedAt_ttl_90d', expireAfterSeconds: 90 * 24 * 60 * 60 },
            ],
            errorMessage: '⚠️ Transcription webhook events index creation failed:',
        },
    ];

    for (const task of tasks) {
        try {
            await db.collection(task.collection).createIndexes(task.indexes as any);
            console.log(`✅ ${task.label} indexes created`);
        } catch (error) {
            console.error(task.errorMessage, error);
        }
    }
}
