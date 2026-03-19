export const PROFILE_SETUP_ERROR_MESSAGE = 'We couldn’t finish setting up your account. Please try again.';

export type ProfileEnsureFailurePolicy =
    | {
        kind: 'reject';
        status: 403 | 503;
        error: string;
    }
    | {
        kind: 'allow';
        profileEnsureFailed: true;
    };

export function resolveProfileEnsureFailurePolicy(input: {
    hasExistingUser: boolean;
    errorMessage: string;
}): ProfileEnsureFailurePolicy {
    if (input.errorMessage.includes('New signups are currently disabled')) {
        return {
            kind: 'reject',
            status: 403,
            error: input.errorMessage,
        };
    }

    if (!input.hasExistingUser) {
        return {
            kind: 'reject',
            status: 503,
            error: PROFILE_SETUP_ERROR_MESSAGE,
        };
    }

    return {
        kind: 'allow',
        profileEnsureFailed: true,
    };
}
