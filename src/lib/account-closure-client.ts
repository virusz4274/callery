'use client';

type AcceptedClosure = 'deleted' | 'cleanup_pending';
type Outcome<T> = { known: true; value: T } | { known: false };

/** Best-effort auth cleanup must not hold an already accepted closure open. */
async function bounded<T>(work: () => Promise<T>, timeoutMs: number): Promise<Outcome<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve().then(work).then(value => ({ known: true as const, value }), () => ({ known: false as const })),
            new Promise<Outcome<T>>(resolve => { timer = setTimeout(() => resolve({ known: false }), timeoutMs); }),
        ]);
    } finally { clearTimeout(timer); }
}

export async function finishAccountClosure(subject: string, status: AcceptedClosure, dependencies: {
    currentSubject: () => Promise<string | null>;
    signOut: () => Promise<void>;
    navigate: (href: string) => void;
}, timeoutMs = 3000): Promise<boolean> {
    const identity = await bounded(dependencies.currentSubject, timeoutMs);
    // A response from the previous account must never sign out the next one.
    if (identity.known && identity.value !== null && identity.value !== subject) return false;
    if (identity.known) await bounded(dependencies.signOut, timeoutMs);
    // Unknown auth state still permits the public receipt. Access to the closed
    // account is already revoked; avoid touching cookies for an unknown account.
    dependencies.navigate(`/account-closed?status=${status}`);
    return true;
}
