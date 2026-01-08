import { getUserById, getUserRecordings } from '@/app/actions/admin';
import { UserDetailsPage } from '@/components/pages/admin/user-details-page';
import { notFound } from 'next/navigation';

export default async function UserPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>,
    searchParams: Promise<{ tab?: string }>
}) {
    const { id } = await params;
    const { tab } = await searchParams;

    try {
        const user = await getUserById(id);

        if (!user) {
            notFound();
        }

        // Parallel fetch for related data could be better if we add more
        const recordings = await getUserRecordings(id);

        // Mock invoices for now as per current schema status
        const invoices: unknown[] = [];

        return (
            <UserDetailsPage
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                user={user as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                recordings={recordings as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                invoices={invoices as any}
                defaultTab={tab}
            />
        );
    } catch (error) {
        console.error("Error loading user page:", error);
        notFound();
    }
}
