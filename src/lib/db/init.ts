import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { printAtlasIndexInstructions } from '@/lib/db/init/atlas';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';

dotenv.config();

/**
 * Initialize the database with required indexes.
 * Run with: npx tsx src/lib/db/init.ts
 */
export async function initializeDatabase(): Promise<void> {
    const { Collections, getMongoDb } = await import('@/lib/mongodb');
    const db = await getMongoDb();

    console.log('🔧 Initializing database indexes...');

    await createCoreIndexes(db, Collections);
    await seedPlans(db, Collections);
    await seedSystemSettings(db, Collections);

    console.log('🎉 Database initialization complete!');
    printAtlasIndexInstructions();
}

/**
 * Check if the database connection is working.
 */
export async function testConnection(): Promise<boolean> {
    try {
        const { getMongoDb } = await import('@/lib/mongodb');
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        console.log('✅ MongoDB connection successful');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        return false;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    (async () => {
        const connected = await testConnection();
        if (connected) {
            await initializeDatabase();
        }
        process.exit(0);
    })();
}
