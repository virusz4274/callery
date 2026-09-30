import 'dotenv/config';
import { getMongoDb, Collections } from '../src/lib/mongodb';
import { Contact } from '../src/lib/db/types';

async function main() {
    const db = await getMongoDb();

    // Get the first user to assume it's the current one (or list all users)
    const user = await db.collection(Collections.USERS).findOne({});

    if (!user) {
        console.log('No users found.');
        return;
    }

    console.log(`Checking contacts for user: ${user.name} (${user.authSubject})`);

    const contacts = await db
        .collection<Contact>(Collections.CONTACTS)
        .find({ authSubject: user.authSubject })
        .collation({ locale: 'en', strength: 2 })
        .sort({ name: 1 })
        .toArray();

    console.log(`Total Contacts: ${contacts.length}`);
    console.log('--- Contact List (DB Sort Order) ---');

    contacts.forEach((c, i) => {
        console.log(`${i + 1}. [${c.name}] (ID: ${c._id})`);
    });

    console.log('--- End List ---');

    // Check for potential sort issues
    const lowercaseNames = contacts.filter(c => c.name[0] !== c.name[0].toUpperCase());
    if (lowercaseNames.length > 0) {
        console.log('⚠️ Found contacts starting with lowercase/special chars (might be at end of list):');
        lowercaseNames.forEach(c => console.log(`- ${c.name}`));
    }
}

main().catch(console.error).finally(() => process.exit());
