import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { readStoredGoogleRefreshToken } from '@/services/google/refresh-token-crypto';
import {
    markGoogleContactsSyncFailed,
    prepareGoogleContactsSync,
    recoverStaleGoogleSync,
    runGoogleContactsSync,
} from '@/services/google/start-contacts-sync';
import { createPostContactsSyncHandler } from './handler';

export const POST = createPostContactsSyncHandler({
    getFirebaseUidFromSession,
    findUserByFirebaseUid,
    readStoredGoogleRefreshToken,
    prepareGoogleContactsSync,
    runGoogleContactsSync,
    markGoogleContactsSyncFailed,
    recoverStaleGoogleSync,
});
