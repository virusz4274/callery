
import * as dotenv from 'dotenv';
dotenv.config();
import { fileURLToPath } from 'url';

import { Plan } from '@/lib/db/types';
import { ObjectId } from 'mongodb';

/**
 * Initialize the database with required indexes.
 * This should be run once when setting up a new database.
 * 
 * You can run this via: npx tsx src/lib/db/init.ts
 * Or it will be called automatically on first API request.
 */
export async function initializeDatabase(): Promise<void> {
    // Dynamic import to ensure dotenv is loaded before mongodb.ts is evaluated
    const { getMongoDb, Collections } = await import('@/lib/mongodb');
    const db = await getMongoDb();

    console.log('🔧 Initializing database indexes...');
    // ... matches existing indentation ...

    // Users collection indexes
    try {
        await db.collection(Collections.USERS).createIndexes([
            { key: { firebaseUid: 1 }, unique: true, name: 'firebaseUid_unique' },
            { key: { email: 1 }, name: 'email' },
        ]);
        console.log('✅ Users indexes created');
    } catch (e) {
        console.error('⚠️ Users index creation failed:', e);
    }

    // Recordings collection indexes
    try {
        await db.collection(Collections.RECORDINGS).createIndexes([
            { key: { firebaseUid: 1, recordedAt: -1 }, name: 'firebaseUid_recordedAt' },
            { key: { firebaseUid: 1, contactId: 1 }, name: 'firebaseUid_contactId' },
            { key: { r2Key: 1 }, unique: true, name: 'r2Key_unique' },
            { key: { firebaseUid: 1, isArchived: 1 }, name: 'firebaseUid_isArchived' },
        ]);
        console.log('✅ Recordings indexes created');
    } catch (e) {
        console.error('⚠️ Recordings index creation failed:', e);
    }

    // Contacts collection indexes
    try {
        await db.collection(Collections.CONTACTS).createIndexes([
            { key: { firebaseUid: 1, phoneNumbers: 1 }, unique: true, name: 'firebaseUid_phoneNumbers_unique' },
            { key: { firebaseUid: 1, name: 1 }, name: 'firebaseUid_name' },
        ]);
        console.log('✅ Contacts indexes created');
    } catch (e) {
        console.error('⚠️ Contacts index creation failed (likely duplicates):', e);
    }

    // Plans collection indexes
    try {
        await db.collection(Collections.PLANS).createIndexes([
            { key: { name: 1 }, unique: true, name: 'name_unique' },
        ]);
        console.log('✅ Plans indexes created');
    } catch (e) {
        console.error('⚠️ Plans index creation failed:', e);
    }

    // Admin Logs collection indexes
    try {
        await db.collection(Collections.ADMIN_LOGS).createIndexes([
            { key: { createdAt: -1 }, name: 'createdAt_desc' },
            { key: { adminId: 1 }, name: 'adminId' },
            { key: { action: 1 }, name: 'action' },
        ]);
        console.log('✅ Admin Logs indexes created');
    } catch (e) {
        console.error('⚠️ Admin Logs index creation failed:', e);
    }

    // Seed or Update Plans
    console.log('🌱 Seeding/Updating plans...');
    const now = new Date();

    // Define all plans with their logic
    const plansToSeed: Plan[] = [
        {
            _id: new ObjectId(), // Note: verify_plans script might fail if we keep generating new IDs for updates. 
            // Better strategy: Look up by Name. If exists, update. If not, insert.
            name: 'Free Trial',
            // ... (rest of fields)
        } as any // Temporary cast to fix later
    ];

    // let's construct the array properly inside the loop or map

    const planDefinitions = [
        {
            name: 'Free Trial',
            description: '30 days of full access',
            price: 0,
            currency: 'USD',
            interval: 'monthly',
            limits: { storage: 1 * 1024 * 1024 * 1024, transcription: 60 * 60 },
            features: ['Standard Storage', 'Community Support', '30-Day Limit'],
            isDefault: true,
            isActive: true,
            stripePriceId: '',
        },
        {
            name: 'Standard',
            description: 'For regular usage',
            price: 10,
            currency: 'USD',
            interval: 'monthly',
            limits: { storage: 1 * 1024 * 1024 * 1024, transcription: 60 * 60 },
            features: ['Standard Storage', 'Email Support'],
            isDefault: false,
            isActive: true,
            stripePriceId: '', // TODO: Add Standard Price ID
            stripeStoragePriceId: '', // TODO: Add Standard Metered Storage Price ID (if different rate)
            stripeTranscriptionPriceId: '', // TODO: Add Standard Metered Transcription Price ID
        },
        {
            name: 'Pro',
            description: 'Power user access',
            price: 29,
            currency: 'USD',
            interval: 'monthly',
            limits: { storage: 10 * 1024 * 1024 * 1024, transcription: 1000 * 60 },
            features: [
                '10 GB Storage',
                'Advanced AI Transcription',
                'Priority Email Support',
                'Data Export',
                'Detailed Analytics'
            ],
            isDefault: false,
            isActive: true,
            stripePriceId: 'price_1SpxUMSMMnKTS4i96ePY7SpU', // Pro Base License
            stripeStoragePriceId: 'price_1SpxUNSMMnKTS4i9gKSDdzOG', // Pro Storage (Metered)
            stripeTranscriptionPriceId: 'price_1SpxUMSMMnKTS4i9vgYkQ1bD', // Pro Transcription (Metered)
        },
        {
            name: 'Lifetime',
            description: 'One-time payment for platform access',
            price: 299, // Example
            currency: 'USD',
            interval: 'lifetime',
            limits: { storage: 0, transcription: 0 }, // 0 limits implies PAYG from byte 0? Or do they get some free allowance?
            // "There is no provided quotas for lifetime... only pay-per-usage" -> Limits = 0.
            features: ['Lifetime Access', 'Pay-as-you-go Storage', 'Pay-as-you-go Transcription'],
            isDefault: false,
            isActive: true,
            stripePriceId: '', // TODO: Add Lifetime One-Time Price ID
            stripeStoragePriceId: '', // TODO: Add Lifetime Metered Storage Price ID
            stripeTranscriptionPriceId: '', // TODO: Add Lifetime Metered Transcription Price ID
        },
        {
            name: 'Internal',
            description: 'Team & Family unrestricted access',
            price: 0,
            currency: 'USD',
            interval: 'lifetime',
            limits: { storage: 1024 * 1024 * 1024 * 1024, transcription: 99999 * 60 },
            features: ['Unlimited Access', 'Internal Use'],
            isDefault: false,
            isActive: true,
            stripePriceId: '',
        },
        {
            name: 'Custom',
            description: 'Enterprise needs',
            price: 0,
            currency: 'USD',
            interval: 'yearly',
            limits: { storage: 0, transcription: 0 },
            features: ['Talk to Sales', 'Custom SLA'],
            isDefault: false,
            isActive: true,
            stripePriceId: '',
        }
    ];

    for (const def of planDefinitions) {
        // Upsert by name
        await db.collection(Collections.PLANS).updateOne(
            { name: def.name },
            {
                $set: {
                    description: def.description,
                    price: def.price,
                    currency: def.currency,
                    interval: def.interval as any,
                    limits: def.limits,
                    features: def.features,
                    isDefault: def.isDefault,
                    isActive: def.isActive,
                    stripePriceId: def.stripePriceId,
                    stripeStoragePriceId: (def as any).stripeStoragePriceId,
                    stripeTranscriptionPriceId: (def as any).stripeTranscriptionPriceId,
                    updatedAt: now
                },
                $setOnInsert: {
                    createdAt: now
                }
            },
            { upsert: true }
        );
    }
    console.log('✅ Plans seeded/updated');

    console.log('🎉 Database initialization complete!');
    console.log('');
    console.log('📝 Note: For Atlas Search and Vector Search, you need to create indexes manually in MongoDB Atlas UI:');
    console.log('');
    console.log('1. Atlas Search Index (for keyword/full-text search):');
    console.log('   - Index name: recordings_text_search');
    console.log('   - Collection: recordings');
    console.log('   - JSON Configuration:');
    console.log(JSON.stringify({
        "mappings": {
            "dynamic": false,
            "fields": {
                "firebaseUid": {
                    "type": "string"
                },
                "summary": {
                    "type": "string"
                },
                "contactName": {
                    "type": "string"
                },
                "fileName": {
                    "type": "string"
                },
                "fullTranscript": {
                    "type": "document",
                    "fields": {
                        "text": {
                            "type": "string"
                        }
                    }
                },
                "tags": {
                    "type": "string"
                },
                "standardizedDisplayName": {
                    "type": "string"
                }
            }
        }
    }, null, 2));
    console.log('');
    console.log('2. Atlas Vector Search Index (for semantic search):');
    console.log('   - Index name: recordings_vector_search');
    console.log('   - Collection: recordings');
    console.log('   - JSON Configuration:');
    console.log(JSON.stringify({
        "fields": [
            {
                "numDimensions": 3072,
                "path": "summaryEmbedding",
                "similarity": "cosine",
                "type": "vector"
            },
            {
                "path": "firebaseUid",
                "type": "filter"
            }
        ]
    }, null, 2));
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

// Allow running this file directly for initialization
// Usage: npx tsx src/lib/db/init.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    (async () => {
        const connected = await testConnection();
        if (connected) {
            await initializeDatabase();
        }
        process.exit(0);
    })();
}
