import { getCurrentAdmin, getUserById, getUserInvoices, getUserRecordings } from '@/app/actions/admin';
import { UserDetailsPage } from '@/components/pages/admin/user-details-page';
import { notFound, redirect } from 'next/navigation';

export default async function UserPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>,
    searchParams: Promise<{ tab?: string }>
}) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const { id } = await params;
    const { tab } = await searchParams;
    const user = await getUserById(id);

    if (!user) {
        notFound();
    }

    const [recordings, invoices] = await Promise.all([
        getUserRecordings(id),
        getUserInvoices(id),
    ]);

    return (
        <UserDetailsPage
            user={user as any}
            recordings={recordings as any}
            invoices={invoices as any}
            defaultTab={tab}
        />
    );
}
