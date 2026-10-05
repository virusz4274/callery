import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { printAtlasIndexInstructions } from '@/lib/db/init/atlas';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { logger } from '@/lib/logger';

dotenv.config();

/**
 * Initialize the database with required indexes.
 * Run with: npx tsx src/lib/db/init.ts
 */
export async function initializeDatabase(): Promise<void> {
    const { Collections, getMongoDb } = await import('@/lib/mongodb');
    const db = await getMongoDb();

    logger.info('🔧 Initializing database indexes...');

    await createCoreIndexes(db, Collections);
    await seedPlans(db, Collections);
    await seedSystemSettings(db, Collections);

    logger.info('🎉 Database initialization complete!');
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
        logger.info('✅ MongoDB connection successful');
        return true;
    } catch (error) {
        logger.error('❌ MongoDB connection failed:', error);
        return false;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    (async () => {
        try {
            if (!(await testConnection())) process.exit(1);
            await initializeDatabase();
            process.exit(0);
        } catch (error) {
            logger.error('Database initialization failed:', error);
            process.exit(1);
        }
    })();
}
