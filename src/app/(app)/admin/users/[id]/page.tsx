import { getCurrentAdmin, getUserById, getUserInvoices, getUserRecordings } from '@/app/actions/admin';
import { UserDetailsPage } from '@/components/pages/admin/user-details-page';
import { notFound, redirect } from 'next/navigation';
import { getTeamSettings } from '@/lib/team-policy';

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

    const teamMode = (await getTeamSettings()).enabled;
    const [recordings, invoices] = await Promise.all([
        getUserRecordings(id),
        teamMode ? Promise.resolve([]) : getUserInvoices(id),
    ]);

    // The admin queries return raw MongoDB documents while UserDetailsPage expects the API
    // response shapes from `@/lib/types`. The shapes are structurally compatible at runtime
    // (ObjectId → string, Date → ISO string serialization happens via Next.js RSC). Until the
    // queries are switched to return response converters, cast at the boundary.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (
        <UserDetailsPage
            user={user as any}
            recordings={recordings as any}
            invoices={invoices as any}
            defaultTab={tab}
            teamMode={teamMode}
        />
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
}
