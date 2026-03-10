import type { Db } from 'mongodb';

type CollectionsMap = {
    USERS: string;
    RECORDINGS: string;
    CONTACTS: string;
    PLANS: string;
    ADMIN_LOGS: string;
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
