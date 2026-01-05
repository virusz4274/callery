import { getMongoDb, Collections } from '@/lib/mongodb';

/**
 * Initialize the database with required indexes.
 * This should be run once when setting up a new database.
 * 
 * You can run this via: npx tsx src/lib/db/init.ts
 * Or it will be called automatically on first API request.
 */
export async function initializeDatabase(): Promise<void> {
    const db = await getMongoDb();

    console.log('🔧 Initializing database indexes...');

    // Users collection indexes
    await db.collection(Collections.USERS).createIndexes([
        { key: { firebaseUid: 1 }, unique: true, name: 'firebaseUid_unique' },
        { key: { email: 1 }, name: 'email' },
    ]);
    console.log('✅ Users indexes created');

    // Recordings collection indexes
    await db.collection(Collections.RECORDINGS).createIndexes([
        { key: { firebaseUid: 1, recordedAt: -1 }, name: 'firebaseUid_recordedAt' },
        { key: { firebaseUid: 1, contactId: 1 }, name: 'firebaseUid_contactId' },
        { key: { r2Key: 1 }, unique: true, name: 'r2Key_unique' },
        { key: { firebaseUid: 1, isArchived: 1 }, name: 'firebaseUid_isArchived' },
    ]);
    console.log('✅ Recordings indexes created');

    // Contacts collection indexes
    await db.collection(Collections.CONTACTS).createIndexes([
        { key: { firebaseUid: 1, phoneNumber: 1 }, unique: true, name: 'firebaseUid_phoneNumber_unique' },
        { key: { firebaseUid: 1, name: 1 }, name: 'firebaseUid_name' },
    ]);
    console.log('✅ Contacts indexes created');

    console.log('🎉 Database initialization complete!');
    console.log('');
    console.log('📝 Note: For Atlas Search and Vector Search, you need to create indexes manually in MongoDB Atlas UI:');
    console.log('');
    console.log('1. Atlas Search Index (for keyword/full-text search):');
    console.log('   - Index name: recordings_text_search');
    console.log('   - Collection: recordings');
    console.log('   - See implementation_plan.md for the full index definition');
    console.log('');
    console.log('2. Atlas Vector Search Index (for semantic search):');
    console.log('   - Index name: recordings_vector_search');
    console.log('   - Collection: recordings');
    console.log('   - See implementation_plan.md for the full index definition');
}

/**
 * Check if the database connection is working.
 */
export async function testConnection(): Promise<boolean> {
    try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        console.log('✅ MongoDB connection successful');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        return false;
    }
}

// Allow running this file directly for initialization
// Usage: npx tsx src/lib/db/init.ts
if (require.main === module) {
    (async () => {
        const connected = await testConnection();
        if (connected) {
            await initializeDatabase();
        }
        process.exit(0);
    })();
}
