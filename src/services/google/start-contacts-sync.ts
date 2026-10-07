import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { getOAuth2Client } from '@/services/google/oauth';
import { syncContactsBackground } from '@/services/google/contacts-sync';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { findUserByAuthSubject } from '@/lib/db/users';
import {
    encryptGoogleRefreshToken,
    getGoogleTokenEncryptionErrorMessage,
    readStoredGoogleRefreshToken,
} from '@/services/google/refresh-token-crypto';
import type { GoogleSyncDuplicatePhoneIssue } from '@/lib/db/types';
import { logger } from '@/lib/logger';

const GOOGLE_SYNC_STALE_AFTER_MS = 15 * 60 * 1000;
const STALE_SYNC_ERROR_MESSAGE = 'Previous sync did not finish. Please try again.';

type GoogleCredentialState = {
    refreshToken?: string;
    expiryDate?: number;
    scopes?: string[];
};

type RunGoogleContactsSyncDependencies = {
    findUserByAuthSubject: typeof findUserByAuthSubject;
    readStoredGoogleRefreshToken: typeof readStoredGoogleRefreshToken;
    getOAuth2Client: typeof getOAuth2Client;
    syncContactsBackground: typeof syncContactsBackground;
    updateGoogleSyncState: typeof updateGoogleSyncState;
};

type StartGoogleContactsSyncDependencies = {
    getOAuth2Client: typeof getOAuth2Client;
    getAuthSubjectFromSession: typeof getAuthSubjectFromSession;
    findUserByAuthSubject: typeof findUserByAuthSubject;
    readStoredGoogleRefreshToken: typeof readStoredGoogleRefreshToken;
    prepareGoogleContactsSync: typeof prepareGoogleContactsSync;
    scheduleGoogleContactsSyncInBackground: typeof scheduleGoogleContactsSyncInBackground;
    recoverStaleGoogleSync: typeof recoverStaleGoogleSync;
};

type DisconnectGoogleContactsDependencies = {
    findUserByAuthSubject: typeof findUserByAuthSubject;
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
    authSubject: string,
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
        duplicatePhoneIssueCount?: number;
        duplicatePhoneIssues?: GoogleSyncDuplicatePhoneIssue[];
        duplicatePhoneIssueDetectedAt?: Date | null;
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
    if (patch.duplicatePhoneIssueCount !== undefined) {
        setData['googleSync.duplicatePhoneIssueCount'] = patch.duplicatePhoneIssueCount;
    }
    if (patch.duplicatePhoneIssues !== undefined) {
        setData['googleSync.duplicatePhoneIssues'] = patch.duplicatePhoneIssues;
    }
    if (patch.duplicatePhoneIssueDetectedAt !== undefined) {
        if (patch.duplicatePhoneIssueDetectedAt === null) {
            unsetData['googleSync.duplicatePhoneIssueDetectedAt'] = '';
        } else {
            setData['googleSync.duplicatePhoneIssueDetectedAt'] = patch.duplicatePhoneIssueDetectedAt;
        }
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
        { authSubject },
        updateOperation,
        { returnDocument: 'after' }
    );
}

export async function prepareGoogleContactsSync(authSubject: string, credentials: GoogleCredentialState) {
    const now = new Date();
    const user = await findUserByAuthSubject(authSubject);
    await updateGoogleSyncState(authSubject, {
        status: 'syncing',
        connectedAt: credentials.refreshToken
            ? user?.googleSync.connectedAt || now
            : user?.googleSync.connectedAt,
        lastAttemptAt: now,
        lastError: null,
        refreshToken: credentials.refreshToken,
        scopes: credentials.scopes,
        tokenExpiresAt: typeof credentials.expiryDate === 'number' ? new Date(credentials.expiryDate) : undefined,
    });
}

export function isGoogleSyncStale(googleSync: User['googleSync']) {
    if (googleSync.status !== 'syncing' || !googleSync.lastAttemptAt) {
        return false;
    }

    return Date.now() - googleSync.lastAttemptAt.getTime() >= GOOGLE_SYNC_STALE_AFTER_MS;
}

export async function recoverStaleGoogleSync(authSubject: string, googleSync: User['googleSync']) {
    if (!isGoogleSyncStale(googleSync)) {
        return false;
    }

    await updateGoogleSyncState(authSubject, {
        status: 'failed',
        lastError: STALE_SYNC_ERROR_MESSAGE,
    });

    return true;
}

export async function runGoogleContactsSyncWithDependencies(
    authSubject: string,
    dependencies: RunGoogleContactsSyncDependencies
) {
    const user = await dependencies.findUserByAuthSubject(authSubject);
    const refreshToken = dependencies.readStoredGoogleRefreshToken(user?.googleSync);
    if (!user || !refreshToken) {
        throw new Error('Google account is not connected. Please reconnect first.');
    }

    const backgroundClient = dependencies.getOAuth2Client();
    backgroundClient.setCredentials({
        refresh_token: refreshToken,
    });

    const syncResult = await dependencies.syncContactsBackground(authSubject, backgroundClient);
    const duplicatePhoneIssueCount = syncResult.duplicatePhoneIssues.length;
    const duplicatePhoneIssueDetectedAt = duplicatePhoneIssueCount > 0 ? new Date() : null;

    await dependencies.updateGoogleSyncState(authSubject, {
        status: 'completed',
        lastSyncedAt: new Date(),
        lastImportedCount: syncResult.importedCount,
        lastError: null,
        refreshToken,
        scopes: user.googleSync.scopes,
        tokenExpiresAt: typeof backgroundClient.credentials.expiry_date === 'number'
            ? new Date(backgroundClient.credentials.expiry_date)
            : user.googleSync.tokenExpiresAt,
        duplicatePhoneIssueCount,
        duplicatePhoneIssues: syncResult.duplicatePhoneIssues,
        duplicatePhoneIssueDetectedAt,
    });

    return syncResult;
}

export async function runGoogleContactsSync(authSubject: string) {
    const result = await runGoogleContactsSyncWithDependencies(authSubject, {
        findUserByAuthSubject,
        readStoredGoogleRefreshToken,
        getOAuth2Client,
        syncContactsBackground,
        updateGoogleSyncState,
    });
    for (const path of ['/contacts', '/recordings', '/files']) revalidatePath(path);
    return result;
}

export async function markGoogleContactsSyncFailed(authSubject: string, errorMessage: string) {
    await updateGoogleSyncState(authSubject, {
        status: 'failed',
        lastError: errorMessage,
    });
}

export async function disconnectGoogleContactsWithDependencies(
    authSubject: string,
    dependencies: DisconnectGoogleContactsDependencies
) {
    const user = await dependencies.findUserByAuthSubject(authSubject);
    const refreshToken = dependencies.readStoredGoogleRefreshToken(user?.googleSync);

    if (refreshToken) {
        try {
            const client = dependencies.getOAuth2Client();
            await client.revokeToken(refreshToken);
        } catch (error) {
            logger.warn('Failed to revoke Google refresh token during disconnect:', error);
        }
    }

    await dependencies.updateGoogleSyncState(authSubject, {
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
        { authSubject },
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

export async function disconnectGoogleContacts(authSubject: string) {
    return disconnectGoogleContactsWithDependencies(authSubject, {
        findUserByAuthSubject,
        readStoredGoogleRefreshToken,
        getOAuth2Client,
        updateGoogleSyncState,
        getMongoDb,
    });
}

export function scheduleGoogleContactsSyncInBackground(authSubject: string) {
    waitUntil(
        runGoogleContactsSync(authSubject).catch(async (error) => {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            logger.error('Error running Google contacts sync in background:', error);
            await markGoogleContactsSyncFailed(authSubject, errorMessage);
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

        const userId = await dependencies.getAuthSubjectFromSession();
        if (!userId) {
            return { success: false, error: 'User not authenticated' };
        }

        const user = await dependencies.findUserByAuthSubject(userId);
        if (!user) {
            return { success: false, error: 'User profile not found' };
        }
        if (user.googleSync.status === 'syncing') {
            const recovered = await dependencies.recoverStaleGoogleSync(userId, user.googleSync);
            if (!recovered) {
                return { success: false, error: 'Google Contacts sync is already in progress.' };
            }
        }

        const existingRefreshToken = dependencies.readStoredGoogleRefreshToken(user.googleSync);
        const refreshToken = tokens.refresh_token || existingRefreshToken;
        const scopes = parseScopes(tokens.scope) || user.googleSync.scopes;

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
        logger.error('Error initiating Google contacts sync:', error);
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
        getAuthSubjectFromSession,
        findUserByAuthSubject,
        readStoredGoogleRefreshToken,
        prepareGoogleContactsSync,
        scheduleGoogleContactsSyncInBackground,
        recoverStaleGoogleSync,
    });
}
