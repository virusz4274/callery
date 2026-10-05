import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { readStoredGoogleRefreshToken } from '@/services/google/refresh-token-crypto';
import {
    markGoogleContactsSyncFailed,
    prepareGoogleContactsSync,
    recoverStaleGoogleSync,
    runGoogleContactsSync,
} from '@/services/google/start-contacts-sync';
import { createPostContactsSyncHandler } from './handler';

export const POST = createPostContactsSyncHandler({
    getAuthSubjectFromSession,
    findUserByAuthSubject,
    readStoredGoogleRefreshToken,
    prepareGoogleContactsSync,
    runGoogleContactsSync,
    markGoogleContactsSyncFailed,
    recoverStaleGoogleSync,
});
