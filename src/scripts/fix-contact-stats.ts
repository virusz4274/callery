import 'dotenv/config';
import { getMongoDb, Collections } from '../lib/mongodb';
import { linkRecordingsToContact } from '../lib/db/contacts';
import type { User } from '../lib/db/types';

async function main() {
    console.log('Starting contact stats migration...');
    const db = await getMongoDb();

    // Get all users
    const users = await db.collection<User>(Collections.USERS).find({}).toArray();
    console.log(`Found ${users.length} users to process.`);

    for (const user of users) {
        console.log(`Processing user: ${user.email} (${user.authSubject})`);

        // Get all contacts for this user
        // We use the raw collection to avoid any helper logic overhead/filtering
        const contacts = await db.collection(Collections.CONTACTS).find({ authSubject: user.authSubject }).toArray();
        console.log(`  - Found ${contacts.length} contacts.`);

        let updatedCount = 0;

        for (const contact of contacts) {
            if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
                await linkRecordingsToContact(contact._id, contact.phoneNumbers, user.authSubject);
                updatedCount++;
            }
        }
        console.log(`  - Updated stats for ${updatedCount} contacts.`);
    }

    console.log('Migration complete.');
    process.exit(0);
}

main().catch(console.error);
