import { MongoClient, Db } from 'mongodb';

if (!process.env.MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
}

const uri = process.env.MONGODB_URI;

// Standard options for Next.js/Serverless environments (Vercel/Docker)
const options: any = {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    const globalWithMongo = globalThis as typeof globalThis & {
        _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
        client = new MongoClient(uri, options);
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
    clientPromise = globalWithMongo._mongoClientPromise;
} else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(uri, options);
    // console.log('Creating new MongoDB client (prod/worker)...');
    clientPromise = client.connect()
        .then(c => {
            // console.log('MongoDB Connected (prod/worker)');
            return c;
        })
        .catch(err => {
            console.error('MongoDB Connection Error (prod/worker):', err);
            throw err;
        });
}

/**
 * Get the MongoDB client instance.
 * This is connection-pooled and reused across requests.
 */
export async function getMongoClient(): Promise<MongoClient> {
    return clientPromise;
}

/**
 * Get the default database instance.
 * The database name is extracted from the MONGODB_URI connection string.
 */
export async function getMongoDb(): Promise<Db> {
    const client = await clientPromise;
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
    EXPORT_JOBS: 'export_jobs',
    SYSTEM_SETTINGS: 'system_settings',
    ANNOUNCEMENTS: 'announcements',
    ADMIN_LOGS: 'admin_logs',
    NOTIFICATIONS: 'notifications',
    SUPPORT_MESSAGES: 'support_messages',
    STRIPE_WEBHOOK_EVENTS: 'stripe_webhook_events',
    TRANSCRIPTION_WEBHOOK_EVENTS: 'transcription_webhook_events',
} as const;

export default clientPromise;
