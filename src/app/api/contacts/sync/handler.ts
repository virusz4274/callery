import { NextResponse } from 'next/server';

import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { getGoogleTokenEncryptionErrorMessage, readStoredGoogleRefreshToken } from '@/services/google/refresh-token-crypto';
import {
    isGoogleSyncStale,
    markGoogleContactsSyncFailed,
    prepareGoogleContactsSync,
    recoverStaleGoogleSync,
    runGoogleContactsSync,
} from '@/services/google/start-contacts-sync';

export type ContactsSyncRouteDependencies = {
    getFirebaseUidFromSession: typeof getFirebaseUidFromSession;
    findUserByFirebaseUid: typeof findUserByFirebaseUid;
    readStoredGoogleRefreshToken: typeof readStoredGoogleRefreshToken;
    prepareGoogleContactsSync: typeof prepareGoogleContactsSync;
    runGoogleContactsSync: typeof runGoogleContactsSync;
    markGoogleContactsSyncFailed: typeof markGoogleContactsSyncFailed;
    recoverStaleGoogleSync: typeof recoverStaleGoogleSync;
};

export function createPostContactsSyncHandler(dependencies: ContactsSyncRouteDependencies) {
    return async function POST() {
        const firebaseUid = await dependencies.getFirebaseUidFromSession();
        if (!firebaseUid) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const user = await dependencies.findUserByFirebaseUid(firebaseUid);
        const refreshToken = dependencies.readStoredGoogleRefreshToken(user?.googleSync);

        if (!user || !refreshToken) {
            return NextResponse.json(
                { success: false, error: 'Google account is not connected. Please reconnect first.' },
                { status: 400 }
            );
        }

        if (user.googleSync?.status === 'syncing' && !isGoogleSyncStale(user.googleSync)) {
            return NextResponse.json(
                { success: false, error: 'Google Contacts sync is already in progress.' },
                { status: 409 }
            );
        }

        if (user.googleSync?.status === 'syncing') {
            await dependencies.recoverStaleGoogleSync(firebaseUid, user.googleSync);
        }

        try {
            await dependencies.prepareGoogleContactsSync(firebaseUid, {
                refreshToken,
                scopes: user.googleSync?.scopes,
                expiryDate: user.googleSync?.tokenExpiresAt?.getTime(),
            });

            const syncResult = await dependencies.runGoogleContactsSync(firebaseUid);

            return NextResponse.json({
                success: true,
                message: 'Contacts synced successfully.',
                duplicatePhoneIssueCount: syncResult.duplicatePhoneIssues.length,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to sync contacts';
            await dependencies.markGoogleContactsSyncFailed(firebaseUid, errorMessage);

            if (error instanceof Error && error.message === getGoogleTokenEncryptionErrorMessage()) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Google sync is not configured correctly on this deployment. Please contact support.',
                    },
                    { status: 500 }
                );
            }

            return NextResponse.json(
                { success: false, error: errorMessage },
                { status: 500 }
            );
        }
    };
}
