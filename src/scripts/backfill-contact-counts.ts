import 'dotenv/config'; // Load .env file
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Contact, Recording } from '@/lib/db/types';

/**
 * Script to backfill totalRecordings and lastRecordingAt for all contacts.
 * Usage: npx tsx src/scripts/backfill-contact-counts.ts
 */
async function main() {
    console.log('Starting backfill of contact recording counts...');

    // Ensure DB connection
    const db = await getMongoDb();
    const contactsCollection = db.collection<Contact>(Collections.CONTACTS);
    const recordingsCollection = db.collection<Recording>(Collections.RECORDINGS);

    // Get all contacts
    const contacts = await contactsCollection.find({}).toArray();
    console.log(`Found ${contacts.length} contacts to process.`);

    let updatedCount = 0;

    for (const contact of contacts) {
        // Count recordings for this contact. Matches linkRecordingsToContact:
        // ALL recordings (including archived) — totalRecordings is lifetime.
        const recordings = await recordingsCollection
            .find({ contactId: contact._id }) // Use ObjectId directly
            .sort({ recordedAt: -1 })
            .toArray();

        const count = recordings.length;
        const lastRecordingAt = recordings.length > 0 ? recordings[0].recordedAt : null;

        // Update contact if different
        if (contact.totalRecordings !== count ||
            (contact.lastRecordingAt?.getTime() !== lastRecordingAt?.getTime())) {

            await contactsCollection.updateOne(
                { _id: contact._id },
                {
                    $set: {
                        totalRecordings: count,
                        lastRecordingAt: lastRecordingAt,
                        updatedAt: new Date()
                    }
                }
            );

            process.stdout.write('.');
            updatedCount++;
        }
    }

    console.log(`\n\nBackfill complete.`);
    console.log(`Updated ${updatedCount} contacts.`);
    process.exit(0);
}

// Check if running directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}
