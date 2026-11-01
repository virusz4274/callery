import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { printAtlasIndexInstructions } from '@/lib/db/init/atlas';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { logger } from '@/lib/logger';
import type { Db } from 'mongodb';
import { billingEnabled } from '@/lib/config';
import { inspectInitialization, type InitializationReport } from '@/lib/db/init/report';

export interface InitializationOptions { db?: Db; dryRun?: boolean; managed?: boolean; printSearchInstructions?: boolean }

/**
 * Initialize the database with required indexes.
 * Run with: pnpm db:init [--dry-run]
 */
export async function initializeDatabase(options: InitializationOptions = {}): Promise<InitializationReport> {
    const { Collections, getMongoDb } = await import('@/lib/mongodb');
    const db = options.db || await getMongoDb();
    const managed = options.managed ?? billingEnabled();
    const report = await inspectInitialization(db, Collections, managed);
    logger.info(options.dryRun ? 'Database initialization dry-run (read-only):' : 'Database initialization preflight:');
    logger.info(JSON.stringify(options.dryRun ? report : { ...report,
        indexes: { missing: report.indexes.missing.length, replacements: report.indexes.replacements, conflicts: report.indexes.conflicts } }, null, 2));
    if (report.errors.length) throw new Error(`Database initialization has structural conflicts: ${report.errors.join(' ')}`);
    if (options.dryRun) return report;

    logger.info('🔧 Initializing database indexes...');

    await createCoreIndexes(db, Collections);
    await seedPlans(db, Collections);
    await seedSystemSettings(db, Collections, managed);

    logger.info('🎉 Database initialization complete!');
    if (options.printSearchInstructions !== false) printAtlasIndexInstructions();
    return report;
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
            if (process.argv.slice(2).some(argument => argument !== '--dry-run')) throw new Error('Usage: pnpm db:init [--dry-run]');
            dotenv.config({ quiet: true });
            if (!(await testConnection())) process.exit(1);
            await initializeDatabase({ dryRun: process.argv.includes('--dry-run') });
            process.exit(0);
        } catch (error) {
            logger.error('Database initialization failed:', error);
            process.exit(1);
        }
    })();
}
