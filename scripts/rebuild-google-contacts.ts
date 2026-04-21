#!/usr/bin/env tsx

import 'dotenv/config';

import { createCoreIndexes } from '../src/lib/db/init/indexes';
import { Collections, getMongoDb } from '../src/lib/mongodb';
import { clearContactsForUser } from '../src/lib/db/contacts/reset';
import { runGoogleContactsSync } from '../src/services/google/start-contacts-sync';

type UserProjection = {
    firebaseUid: string;
    email?: string;
    googleSync?: {
        refreshTokenCiphertext?: string;
    };
};

function getFlagValue(flag: string): string | undefined {
    const entry = process.argv.find((arg) => arg.startsWith(`${flag}=`));
    return entry ? entry.slice(flag.length + 1) : undefined;
}

async function rebuildGoogleContactsProjection(): Promise<void> {
    const firebaseUid = getFlagValue('--firebaseUid');
    const skipSync = process.argv.includes('--skip-sync');
    const db = await getMongoDb();

    const userQuery = firebaseUid
        ? { firebaseUid }
        : { 'googleSync.refreshTokenCiphertext': { $exists: true } };
    const users = await db.collection<UserProjection>(Collections.USERS).find(userQuery).toArray();

    if (users.length === 0) {
        console.log('No users matched the rebuild query.');
        return;
    }

    if (firebaseUid) {
        console.log(`Clearing Google contact projection for ${firebaseUid}...`);
        await clearContactsForUser(firebaseUid);
    } else {
        console.log('Dropping contacts collection...');
        await db.collection(Collections.CONTACTS).drop().catch((error: { code?: number }) => {
            if (error?.code !== 26) {
                throw error;
            }
        });
        await db.collection(Collections.USERS).updateMany(
            {},
            {
                $set: {
                    totalContacts: 0,
                    updatedAt: new Date(),
                },
            }
        );
    }

    console.log('Recreating core indexes...');
    await createCoreIndexes(db, Collections);

    if (skipSync) {
        console.log('Skipping Google sync as requested.');
        return;
    }

    const syncableUsers = users.filter((user) => user.googleSync?.refreshTokenCiphertext);
    for (const user of syncableUsers) {
        console.log(`Rebuilding Google contact projection for ${user.email || user.firebaseUid}...`);
        await runGoogleContactsSync(user.firebaseUid);
    }

    const invalidContacts = await db.collection(Collections.CONTACTS).countDocuments({
        googleContactId: { $not: { $type: 'string' } },
    });

    if (invalidContacts > 0) {
        throw new Error(`Rebuild completed, but found ${invalidContacts} non-Google-backed contacts.`);
    }

    console.log('Google contact projection rebuild complete.');
}

rebuildGoogleContactsProjection().catch((error) => {
    console.error('Failed to rebuild Google contacts:', error);
    process.exit(1);
});
