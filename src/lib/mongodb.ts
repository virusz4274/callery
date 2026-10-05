import { Resolver } from 'node:dns/promises';
import { Db, MongoClient, type MongoClientOptions } from 'mongodb';
import { logger } from '@/lib/logger';

import { env } from './env';

const isDevelopment = env.NODE_ENV === 'development';
const DEFAULT_FALLBACK_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];
type MongoConnectionMode = 'default' | 'fallback-first';

const options: MongoClientOptions = {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
};

interface MongoCache {
    clientPromise?: Promise<MongoClient>;
    fallbackUri?: string;
}

const globalWithMongo = globalThis as typeof globalThis & {
    _mongoCache?: MongoCache;
};

const cache: MongoCache = isDevelopment
    ? (globalWithMongo._mongoCache ??= {})
    : {};

function getFallbackDnsServers(): string[] {
    const configured = env.MONGODB_DNS_SERVERS
        ?.split(',')
        .map((entry: string) => entry.trim())
        .filter(Boolean);

    if (configured && configured.length > 0) {
        return configured;
    }

    return DEFAULT_FALLBACK_DNS_SERVERS;
}

function getMongoConnectionMode(): MongoConnectionMode {
    return env.MONGODB_CONNECTION_MODE;
}

function decodeMaybeEncoded(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function buildAuthSegment(url: URL): string {
    if (!url.username) {
        return '';
    }

    const encodedUser = encodeURIComponent(decodeMaybeEncoded(url.username));
    if (!url.password) {
        return `${encodedUser}@`;
    }

    const encodedPassword = encodeURIComponent(decodeMaybeEncoded(url.password));
    return `${encodedUser}:${encodedPassword}@`;
}

function isSrvDnsFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    const haystack = `${message} ${code}`.toLowerCase();

    return haystack.includes('querysrv')
        || haystack.includes('srv')
        || haystack.includes('dns')
        || haystack.includes('etimeout')
        || haystack.includes('enotfound')
        || haystack.includes('eservfail');
}

async function buildFallbackSrvUri(connectionUri: string): Promise<string> {
    const parsed = new URL(connectionUri);
    const resolver = new Resolver();
    const dnsServers = getFallbackDnsServers();
    resolver.setServers(dnsServers);

    const srvLookupHost = `_mongodb._tcp.${parsed.hostname}`;
    const srvRecords = await resolver.resolveSrv(srvLookupHost);

    if (srvRecords.length === 0) {
        throw new Error(`No SRV records found for ${srvLookupHost}`);
    }

    const hosts = srvRecords
        .sort((left, right) => {
            if (left.priority !== right.priority) {
                return left.priority - right.priority;
            }
            if (left.weight !== right.weight) {
                return right.weight - left.weight;
            }
            return left.name.localeCompare(right.name);
        })
        .map((record) => `${record.name}:${record.port}`)
        .join(',');

    const mergedParams = new URLSearchParams(parsed.searchParams.toString());
    try {
        const txtRecords = await resolver.resolveTxt(parsed.hostname);
        if (txtRecords.length > 0) {
            const txtPayload = txtRecords[0].join('');
            const txtOptions = new URLSearchParams(txtPayload);
            for (const [key, value] of txtOptions.entries()) {
                if (!mergedParams.has(key)) {
                    mergedParams.set(key, value);
                }
            }
        }
    } catch (error) {
        const dnsError = error as NodeJS.ErrnoException;
        if (dnsError.code !== 'ENODATA' && dnsError.code !== 'ENOTFOUND') {
            throw error;
        }
    }

    if (!mergedParams.has('tls') && !mergedParams.has('ssl')) {
        mergedParams.set('tls', 'true');
    }

    const authSegment = buildAuthSegment(parsed);
    const pathSegment = parsed.pathname === '/' ? '' : parsed.pathname;
    const querySegment = mergedParams.toString();

    return `mongodb://${authSegment}${hosts}${pathSegment}${querySegment ? `?${querySegment}` : ''}`;
}

async function connectClient(connectionUri: string, label: 'primary' | 'fallback'): Promise<MongoClient> {
    const mongoClient = new MongoClient(connectionUri, options);
    await mongoClient.connect();

    if (isDevelopment) {
        const mode = label === 'primary' ? 'primary' : 'SRV fallback';
        logger.info(`MongoDB Connected (${mode}, dev)`);
    }

    return mongoClient;
}

async function createClient(): Promise<MongoClient> {
    const uri = env.MONGODB_URI;
    if (!uri) throw new Error("Missing MONGODB_URI. See .env.example.");
    if (uri.startsWith('mongodb+srv://') && getMongoConnectionMode() === 'fallback-first') {
        try {
            if (!cache.fallbackUri) {
                cache.fallbackUri = await buildFallbackSrvUri(uri);
            }

            if (isDevelopment) {
                logger.warn('[MongoDB] Using fallback-first connection mode.');
            }

            return await connectClient(cache.fallbackUri, 'fallback');
        } catch (fallbackFirstError) {
            logger.error('[MongoDB] fallback-first connection failed, retrying primary URI:', fallbackFirstError);
        }
    }

    try {
        if (isDevelopment) {
            logger.info('Creating new MongoDB client (dev)...');
        }
        return await connectClient(uri, 'primary');
    } catch (primaryError) {
        if (!uri.startsWith('mongodb+srv://') || !isSrvDnsFailure(primaryError)) {
            throw primaryError;
        }

        if (isDevelopment) {
            logger.warn('[MongoDB] Primary SRV resolution failed. Attempting DNS fallback resolvers...');
        }

        try {
            if (!cache.fallbackUri) {
                cache.fallbackUri = await buildFallbackSrvUri(uri);
            }

            return await connectClient(cache.fallbackUri, 'fallback');
        } catch (fallbackError) {
            logger.error('[MongoDB] Fallback connection failed:', fallbackError);
            throw primaryError;
        }
    }
}

function getClientPromise(): Promise<MongoClient> {
    if (!cache.clientPromise) {
        cache.clientPromise = createClient().catch((error) => {
            cache.clientPromise = undefined;
            if (isSrvDnsFailure(error)) {
                cache.fallbackUri = undefined;
            }
            logger.error(`MongoDB Connection Error (${isDevelopment ? 'dev' : 'prod/worker'}):`, error);
            throw error;
        });
    }

    return cache.clientPromise;
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
    USAGE_EVENTS: 'usage_events',
    RECORDINGS: 'recordings',
    CONTACTS: 'contacts',
    PLANS: 'plans',
    EXPORT_JOBS: 'export_jobs',
    SYSTEM_SETTINGS: 'system_settings',
    ANNOUNCEMENTS: 'announcements',
    ADMIN_LOGS: 'admin_logs',
    NOTIFICATIONS: 'notifications',
    EXTERNAL_SERVICE_INCIDENTS: 'external_service_incidents',
    SUPPORT_MESSAGES: 'support_messages',
    RATE_LIMIT_BUCKETS: 'rate_limit_buckets',
    STRIPE_WEBHOOK_EVENTS: 'stripe_webhook_events',
    TRANSCRIPTION_WEBHOOK_EVENTS: 'transcription_webhook_events',
} as const;

export default getClientPromise;
