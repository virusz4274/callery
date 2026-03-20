import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';
import { getOAuth2Client } from '@/services/google/oauth';
import { syncContactsBackground } from '@/services/google/contacts-sync';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { enqueueGoogleContactsSyncJob } from '@/lib/async-job-queue';
import {
    encryptGoogleRefreshToken,
    getGoogleTokenEncryptionErrorMessage,
    readStoredGoogleRefreshToken,
} from '@/services/google/refresh-token-crypto';

type GoogleCredentialState = {
    refreshToken?: string;
    accessToken?: string;
    expiryDate?: number;
    scopes?: string[];
};

async function getUserIdFromSessionCookie() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session');

        if (!sessionCookie?.value) {
            console.error('Session cookie not found.');
            return null;
        }

        const adminApp = getFirebaseAdminApp();
        const decodedIdToken = await getAuth(adminApp).verifySessionCookie(sessionCookie.value, true);
        return decodedIdToken.uid;
    } catch (error) {
        console.error('Error verifying session cookie in Google sync:', error);
        return null;
    }
}

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

async function queueGoogleContactsSync(firebaseUid: string, credentials: GoogleCredentialState) {
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

    await enqueueGoogleContactsSyncJob(firebaseUid);
}

export async function runQueuedGoogleContactsSync(firebaseUid: string) {
    const user = await findUserByFirebaseUid(firebaseUid);
    const refreshToken = readStoredGoogleRefreshToken(user?.googleSync);
    if (!user || !refreshToken) {
        throw new Error('Google account is not connected. Please reconnect first.');
    }

    const backgroundClient = getOAuth2Client();
    backgroundClient.setCredentials({
        refresh_token: refreshToken,
    });

    const importedCount = await syncContactsBackground(firebaseUid, backgroundClient);
    await updateGoogleSyncState(firebaseUid, {
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

export async function markQueuedGoogleContactsSyncFailed(firebaseUid: string, errorMessage: string) {
    await updateGoogleSyncState(firebaseUid, {
        status: 'failed',
        lastError: errorMessage,
    });
}

export async function startGoogleContactsSync(code: string) {
    try {
        const oAuth2Client = getOAuth2Client();
        const { tokens } = await oAuth2Client.getToken(code);

        oAuth2Client.setCredentials(tokens);

        const userId = await getUserIdFromSessionCookie();
        if (!userId) {
            return { success: false, error: 'User not authenticated' };
        }

        const user = await findUserByFirebaseUid(userId);
        if (!user) {
            return { success: false, error: 'User profile not found' };
        }

        const existingRefreshToken = readStoredGoogleRefreshToken(user.googleSync);
        const refreshToken = tokens.refresh_token || existingRefreshToken;
        const scopes = parseScopes(tokens.scope) || user.googleSync?.scopes;

        if (!refreshToken) {
            return { success: false, error: 'Google did not return a refresh token. Please reconnect and grant access again.' };
        }

        await queueGoogleContactsSync(userId, {
            refreshToken,
            accessToken: tokens.access_token || undefined,
            expiryDate: tokens.expiry_date || undefined,
            scopes,
        });

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

export async function restartGoogleContactsSync() {
    const userId = await getUserIdFromSessionCookie();
    if (!userId) {
        return { success: false, error: 'User not authenticated' };
    }

    const user = await findUserByFirebaseUid(userId);
    const refreshToken = readStoredGoogleRefreshToken(user?.googleSync);
    if (!user || !refreshToken) {
        return { success: false, error: 'Google account is not connected. Please reconnect first.' };
    }

    try {
        await queueGoogleContactsSync(userId, {
            refreshToken,
            scopes: user.googleSync?.scopes,
            expiryDate: user.googleSync?.tokenExpiresAt?.getTime(),
        });

        return { success: true, message: 'Sync started in background.' };
    } catch (error) {
        console.error('Error restarting Google contacts sync:', error);
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
