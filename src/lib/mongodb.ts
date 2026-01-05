import { MongoClient, Db } from 'mongodb';

if (!process.env.MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
    // eslint-disable-next-line no-var
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
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
} as const;

export default clientPromise;
