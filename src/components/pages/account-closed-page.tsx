import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { publicEnv } from '@/lib/public-env';

export function AccountClosedPage({ status }: { status?: string }) {
    const pending = status === 'cleanup_pending';
    const deleted = status === 'deleted';
    return <AuthShell title={pending ? 'Account closure accepted' : deleted ? 'Account deleted' : 'Account deletion'}>
        <div className="space-y-4 text-sm leading-6">
            <p>{pending ? 'Your account access has been disabled. Your deletion request was accepted, and remaining cleanup will retry automatically. You do not need to submit another request.'
                : deleted ? 'Your account and library have been permanently deleted.'
                    : 'Account deletion is managed from Profile settings. Sign in if you need to manage your account.'}</p>
            {(pending || deleted) && publicEnv.NEXT_PUBLIC_ENABLE_BILLING && <p className="text-muted">Outstanding charges remain payable. Billing settlement and subscription cancellation may continue after account closure.</p>}
            <Link href="/login" className="inline-flex min-h-11 items-center text-accent hover:underline">Go to sign in</Link>
        </div>
    </AuthShell>;
}
