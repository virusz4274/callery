import { waitUntil } from '@vercel/functions';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { getOAuth2Client } from '@/services/google/oauth';
import { syncContactsBackground } from '@/services/google/contacts-sync';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { findUserByFirebaseUid } from '@/lib/db/users';
import {
    encryptGoogleRefreshToken,
    getGoogleTokenEncryptionErrorMessage,
    readStoredGoogleRefreshToken,
} from '@/services/google/refresh-token-crypto';

const GOOGLE_SYNC_STALE_AFTER_MS = 15 * 60 * 1000;
const STALE_SYNC_ERROR_MESSAGE = 'Previous sync did not finish. Please try again.';

type GoogleCredentialState = {
    refreshToken?: string;
    expiryDate?: number;
    scopes?: string[];
};

type RunGoogleContactsSyncDependencies = {
    findUserByFirebaseUid: typeof findUserByFirebaseUid;
    readStoredGoogleRefreshToken: typeof readStoredGoogleRefreshToken;
    getOAuth2Client: typeof getOAuth2Client;
    syncContactsBackground: typeof syncContactsBackground;
    updateGoogleSyncState: typeof updateGoogleSyncState;
};

type StartGoogleContactsSyncDependencies = {
    getOAuth2Client: typeof getOAuth2Client;
    getFirebaseUidFromSession: typeof getFirebaseUidFromSession;
    findUserByFirebaseUid: typeof findUserByFirebaseUid;
    readStoredGoogleRefreshToken: typeof readStoredGoogleRefreshToken;
    prepareGoogleContactsSync: typeof prepareGoogleContactsSync;
    scheduleGoogleContactsSyncInBackground: typeof scheduleGoogleContactsSyncInBackground;
    recoverStaleGoogleSync: typeof recoverStaleGoogleSync;
};

type DisconnectGoogleContactsDependencies = {
    findUserByFirebaseUid: typeof findUserByFirebaseUid;
    readStoredGoogleRefreshToken: typeof readStoredGoogleRefreshToken;
    getOAuth2Client: typeof getOAuth2Client;
    updateGoogleSyncState: typeof updateGoogleSyncState;
    getMongoDb: typeof getMongoDb;
};

function parseScopes(scope: string | null | undefined): string[] | undefined {
    if (!scope) {
        return undefined;
    }

    const scopes = scope
        .split(' ')
        .map((value) => value.trim())
        .filter(Boolean);

    return scopes.length > 0 ? scopes : undefined;
}

export async function updateGoogleSyncState(
    firebaseUid: string,
    patch: {
        status?: 'not_connected' | 'syncing' | 'completed' | 'failed';
        connectedAt?: Date;
        lastAttemptAt?: Date;
        lastSyncedAt?: Date;
        lastError?: string | null;
        lastImportedCount?: number;
        refreshToken?: string | null;
        scopes?: string[];
        tokenExpiresAt?: Date;
    }
) {
    const db = await getMongoDb();
    const setData: Record<string, unknown> = {
        updatedAt: new Date(),
    };
    const unsetData: Record<string, ''> = {};

    if (patch.status !== undefined) {
        setData['googleSync.status'] = patch.status;
    }
    if (patch.connectedAt !== undefined) {
        setData['googleSync.connectedAt'] = patch.connectedAt;
    }
    if (patch.lastAttemptAt !== undefined) {
        setData['googleSync.lastAttemptAt'] = patch.lastAttemptAt;
    }
    if (patch.lastSyncedAt !== undefined) {
        setData['googleSync.lastSyncedAt'] = patch.lastSyncedAt;
    }
    if (patch.lastError !== undefined) {
        if (patch.lastError === null) {
            unsetData['googleSync.lastError'] = '';
        } else {
            setData['googleSync.lastError'] = patch.lastError;
        }
    }
    if (patch.lastImportedCount !== undefined) {
        setData['googleSync.lastImportedCount'] = patch.lastImportedCount;
    }
    if (patch.scopes !== undefined) {
        setData['googleSync.scopes'] = patch.scopes;
    }
    if (patch.tokenExpiresAt !== undefined) {
        setData['googleSync.tokenExpiresAt'] = patch.tokenExpiresAt;
    }

    if (patch.refreshToken !== undefined) {
        if (patch.refreshToken === null) {
            unsetData['googleSync.refreshTokenCiphertext'] = '';
            unsetData['googleSync.refreshTokenKeyVersion'] = '';
        } else {
            const encryptedRefreshToken = encryptGoogleRefreshToken(patch.refreshToken);
            setData['googleSync.refreshTokenCiphertext'] = encryptedRefreshToken.refreshTokenCiphertext;
            setData['googleSync.refreshTokenKeyVersion'] = encryptedRefreshToken.refreshTokenKeyVersion;
        }
    }

    const updateOperation: {
        $set: Record<string, unknown>;
        $unset?: Record<string, ''>;
    } = {
        $set: setData,
    };

    if (Object.keys(unsetData).length > 0) {
        updateOperation.$unset = unsetData;
    }

    return db.collection<User>(Collections.USERS).findOneAndUpdate(
        { firebaseUid },
        updateOperation,
        { returnDocument: 'after' }
    );
}

export async function prepareGoogleContactsSync(firebaseUid: string, credentials: GoogleCredentialState) {
    const now = new Date();
    const user = await findUserByFirebaseUid(firebaseUid);
    await updateGoogleSyncState(firebaseUid, {
        status: 'syncing',
        connectedAt: credentials.refreshToken
            ? user?.googleSync?.connectedAt || now
            : user?.googleSync?.connectedAt,
        lastAttemptAt: now,
        lastError: null,
        refreshToken: credentials.refreshToken,
        scopes: credentials.scopes,
        tokenExpiresAt: typeof credentials.expiryDate === 'number' ? new Date(credentials.expiryDate) : undefined,
    });
}

export function isGoogleSyncStale(googleSync?: User['googleSync']) {
    if (googleSync?.status !== 'syncing' || !googleSync.lastAttemptAt) {
        return false;
    }

    return Date.now() - googleSync.lastAttemptAt.getTime() >= GOOGLE_SYNC_STALE_AFTER_MS;
}

export async function recoverStaleGoogleSync(firebaseUid: string, googleSync?: User['googleSync']) {
    if (!isGoogleSyncStale(googleSync)) {
        return false;
    }

    await updateGoogleSyncState(firebaseUid, {
        status: 'failed',
        lastError: STALE_SYNC_ERROR_MESSAGE,
    });

    return true;
}

export async function runGoogleContactsSyncWithDependencies(
    firebaseUid: string,
    dependencies: RunGoogleContactsSyncDependencies
) {
    const user = await dependencies.findUserByFirebaseUid(firebaseUid);
    const refreshToken = dependencies.readStoredGoogleRefreshToken(user?.googleSync);
    if (!user || !refreshToken) {
        throw new Error('Google account is not connected. Please reconnect first.');
    }

    const backgroundClient = dependencies.getOAuth2Client();
    backgroundClient.setCredentials({
        refresh_token: refreshToken,
    });

    const importedCount = await dependencies.syncContactsBackground(firebaseUid, backgroundClient);
    await dependencies.updateGoogleSyncState(firebaseUid, {
        status: 'completed',
        lastSyncedAt: new Date(),
        lastImportedCount: importedCount,
        lastError: null,
        refreshToken,
        scopes: user.googleSync?.scopes,
        tokenExpiresAt: typeof backgroundClient.credentials.expiry_date === 'number'
            ? new Date(backgroundClient.credentials.expiry_date)
            : user.googleSync?.tokenExpiresAt,
    });
}

export async function runGoogleContactsSync(firebaseUid: string) {
    return runGoogleContactsSyncWithDependencies(firebaseUid, {
        findUserByFirebaseUid,
        readStoredGoogleRefreshToken,
        getOAuth2Client,
        syncContactsBackground,
        updateGoogleSyncState,
    });
}

export async function markGoogleContactsSyncFailed(firebaseUid: string, errorMessage: string) {
    await updateGoogleSyncState(firebaseUid, {
        status: 'failed',
        lastError: errorMessage,
    });
}

export async function disconnectGoogleContactsWithDependencies(
    firebaseUid: string,
    dependencies: DisconnectGoogleContactsDependencies
) {
    const user = await dependencies.findUserByFirebaseUid(firebaseUid);
    const refreshToken = dependencies.readStoredGoogleRefreshToken(user?.googleSync);

    if (refreshToken) {
        try {
            const client = dependencies.getOAuth2Client();
            await client.revokeToken(refreshToken);
        } catch (error) {
            console.warn('Failed to revoke Google refresh token during disconnect:', error);
        }
    }

    await dependencies.updateGoogleSyncState(firebaseUid, {
        status: 'not_connected',
        connectedAt: undefined,
        lastAttemptAt: undefined,
        lastError: null,
        refreshToken: null,
        scopes: undefined,
        tokenExpiresAt: undefined,
    });

    const db = await dependencies.getMongoDb();
    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $unset: {
                'googleSync.connectedAt': '',
                'googleSync.lastAttemptAt': '',
                'googleSync.scopes': '',
                'googleSync.tokenExpiresAt': '',
            },
        }
    );

    return { success: true };
}

export async function disconnectGoogleContacts(firebaseUid: string) {
    return disconnectGoogleContactsWithDependencies(firebaseUid, {
        findUserByFirebaseUid,
        readStoredGoogleRefreshToken,
        getOAuth2Client,
        updateGoogleSyncState,
        getMongoDb,
    });
}

export function scheduleGoogleContactsSyncInBackground(firebaseUid: string) {
    waitUntil(
        runGoogleContactsSync(firebaseUid).catch(async (error) => {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            console.error('Error running Google contacts sync in background:', error);
            await markGoogleContactsSyncFailed(firebaseUid, errorMessage);
        })
    );
}

export async function startGoogleContactsSyncWithDependencies(
    code: string,
    dependencies: StartGoogleContactsSyncDependencies
) {
    try {
        const oAuth2Client = dependencies.getOAuth2Client();
        const { tokens } = await oAuth2Client.getToken(code);

        oAuth2Client.setCredentials(tokens);

        const userId = await dependencies.getFirebaseUidFromSession();
        if (!userId) {
            return { success: false, error: 'User not authenticated' };
        }

        const user = await dependencies.findUserByFirebaseUid(userId);
        if (!user) {
            return { success: false, error: 'User profile not found' };
        }
        if (user.googleSync?.status === 'syncing') {
            const recovered = await dependencies.recoverStaleGoogleSync(userId, user.googleSync);
            if (!recovered) {
                return { success: false, error: 'Google Contacts sync is already in progress.' };
            }
        }

        const existingRefreshToken = dependencies.readStoredGoogleRefreshToken(user.googleSync);
        const refreshToken = tokens.refresh_token || existingRefreshToken;
        const scopes = parseScopes(tokens.scope) || user.googleSync?.scopes;

        if (!refreshToken) {
            return { success: false, error: 'Google did not return a refresh token. Please reconnect and grant access again.' };
        }

        await dependencies.prepareGoogleContactsSync(userId, {
            refreshToken,
            expiryDate: tokens.expiry_date || undefined,
            scopes,
        });
        dependencies.scheduleGoogleContactsSyncInBackground(userId);

        return { success: true, message: 'Sync started in background.' };
    } catch (error) {
        console.error('Error initiating Google contacts sync:', error);
        if (error instanceof Error && error.message === getGoogleTokenEncryptionErrorMessage()) {
            return {
                success: false,
                error: 'Google sync is not configured correctly on this deployment. Please contact support.',
            };
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred.',
        };
    }
}

export async function startGoogleContactsSync(code: string) {
    return startGoogleContactsSyncWithDependencies(code, {
        getOAuth2Client,
        getFirebaseUidFromSession,
        findUserByFirebaseUid,
        readStoredGoogleRefreshToken,
        prepareGoogleContactsSync,
        scheduleGoogleContactsSyncInBackground,
        recoverStaleGoogleSync,
    });
}
