import { getAnnouncements } from '@/app/actions/admin-announcements';
import { getCurrentAdmin } from '@/app/actions/admin';
import { AnnouncementsList } from '@/components/admin/announcements-list';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export default async function AnnouncementsPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    await connection();
    const announcements = await getAnnouncements();

    return (
        <AdminPageShell
            eyebrow="Broadcasts"
            title="Announcements"

            stats={[
                {
                    label: 'Announcements',
                    value: announcements.length,
                    helper: 'Total notices currently stored',
                    iconName: 'Megaphone',
                },
                {
                    label: 'Enabled',
                    value: announcements.filter((announcement) => announcement.isActive).length,
                    helper: 'Notices enabled during their schedule',
                    iconName: 'BellRing',
                },
                {
                    label: 'Alerts',
                    value: announcements.filter((announcement) => announcement.type === 'alert').length,
                    helper: 'High-urgency announcement count',
                    iconName: 'ShieldAlert',
                },
            ]}
        >
            <AnnouncementsList announcements={announcements} />
        </AdminPageShell>
    );
}
