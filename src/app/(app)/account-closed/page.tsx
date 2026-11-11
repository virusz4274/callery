import type { Metadata } from 'next';
import { AccountClosedPage } from '@/components/pages/account-closed-page';

export const metadata: Metadata = {
    title: 'Account deletion',
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function AccountClosed({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
    const { status } = await searchParams;
    return <AccountClosedPage status={typeof status === 'string' ? status : undefined} />;
}
