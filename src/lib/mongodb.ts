import { MongoClient, Db } from 'mongodb';
import { mongoUri } from './config';

// Standard options for Next.js/Serverless environments (Vercel/Docker)
const options: any = {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
};

type GlobalWithMongo = typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
};

let clientPromise: Promise<MongoClient> | undefined;

/**
 * Lazily create (and cache) the shared client promise. Env is read here —
 * never at import time — so builds and unrelated routes don't require
 * MONGODB_URI to merely import this module.
 */
function getClientPromise(): Promise<MongoClient> {
    if (process.env.NODE_ENV === 'development') {
        // In development mode, use a global variable so that the value
        // is preserved across module reloads caused by HMR (Hot Module Replacement).
        const globalWithMongo = globalThis as GlobalWithMongo;

        if (!globalWithMongo._mongoClientPromise) {
            const client = new MongoClient(mongoUri(), options);
            console.log('Creating new MongoDB client (dev)...');
            globalWithMongo._mongoClientPromise = client.connect()
                .then(c => {
                    console.log('MongoDB Connected (dev)');
                    return c;
                })
                .catch(err => {
                    console.error('MongoDB Connection Error (dev):', err);
                    throw err;
                });
        }
        return globalWithMongo._mongoClientPromise;
    }

    if (!clientPromise) {
        const client = new MongoClient(mongoUri(), options);
        clientPromise = client.connect()
            .then(c => {
                return c;
            })
            .catch(err => {
                console.error('MongoDB Connection Error (prod/worker):', err);
                throw err;
            });
    }
    return clientPromise;
}

/**
 * Get the MongoDB client instance.
 * This is connection-pooled and reused across requests.
 */
export async function getMongoClient(): Promise<MongoClient> {
    return getClientPromise();
}

/**
 * Get the default database instance.
 * The database name is extracted from the MONGODB_URI connection string.
 */
export async function getMongoDb(): Promise<Db> {
    const client = await getClientPromise();
    return client.db();
}

/**
 * Collection names used in the application.
 */
export const Collections = {
    USERS: 'users',
    RECORDINGS: 'recordings',
    CONTACTS: 'contacts',
    PLANS: 'plans',
    SYSTEM_SETTINGS: 'system_settings',
    ANNOUNCEMENTS: 'announcements',
    ADMIN_LOGS: 'admin_logs',
    USAGE_EVENTS: 'usage_events',
} as const;
