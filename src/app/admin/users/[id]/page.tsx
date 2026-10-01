import { getUserById, getUserRecordings } from '@/app/actions/admin';
import { getPlans } from '@/app/actions/admin-plans';
import { listCustomerInvoices } from '@/lib/stripe/invoices';
import { UserDetailsPage } from '@/components/pages/admin/user-details-page';
import { notFound } from 'next/navigation';

async function loadUserPage(id: string) {
    const user = await getUserById(id);

    if (!user) {
        notFound();
    }

    const [recordings, plans, invoices] = await Promise.all([
        getUserRecordings(id),
        getPlans(),
        listCustomerInvoices(user.stripeCustomerId),
    ]);

    return { user, recordings, plans, invoices };
}

export default async function UserPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>,
    searchParams: Promise<{ tab?: string }>
}) {
    const { id } = await params;
    const { tab } = await searchParams;

    const { user, recordings, plans, invoices } = await loadUserPage(id).catch((error) => {
        console.error("Error loading user page:", error);
        notFound();
    });

    return (
        <UserDetailsPage
            user={user as any}
            recordings={recordings as any}
            invoices={invoices}
            plans={plans}
            defaultTab={tab}
        />
    );
}
