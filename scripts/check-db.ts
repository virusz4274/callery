#!/usr/bin/env tsx

/**
 * Check MongoDB database status and collections
 */

import 'dotenv/config';
import { getMongoDb, getMongoClient, Collections } from '../src/lib/mongodb';

async function checkDatabase() {
    console.log('🔍 Checking MongoDB Database Status...\n');

    try {
        // Test connection
        const client = await getMongoClient();
        console.log('✅ MongoDB connection successful\n');

        const db = await getMongoDb();
        const dbName = db.databaseName;
        console.log(`📦 Database: ${dbName}\n`);

        // List all collections
        const collections = await db.listCollections().toArray();
        console.log(`📋 Collections (${collections.length}):`);

        if (collections.length === 0) {
            console.log('   ⚠️  No collections found - database is empty\n');
        } else {
            for (const collection of collections) {
                const count = await db.collection(collection.name).countDocuments();
                console.log(`   • ${collection.name}: ${count} documents`);
            }
            console.log();
        }

        // Check expected collections
        console.log('🎯 Expected Collections Status:');
        for (const [key, collectionName] of Object.entries(Collections)) {
            const exists = collections.some(c => c.name === collectionName);
            const count = exists ? await db.collection(collectionName).countDocuments() : 0;
            const status = exists ? '✅' : '❌';
            console.log(`   ${status} ${collectionName} (${key}): ${count} documents`);
        }
        console.log();

        // Check indexes
        console.log('📊 Indexes:');
        for (const [, collectionName] of Object.entries(Collections)) {
            try {
                const indexes = await db.collection(collectionName).listIndexes().toArray();
                console.log(`   ${collectionName}:`);
                indexes.forEach(idx => {
                    console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
                });
            } catch (err) {
                console.log(`   ${collectionName}: Collection doesn't exist yet`);
            }
        }

        console.log('\n✅ Database check complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error checking database:', error);
        process.exit(1);
    }
}

checkDatabase();
