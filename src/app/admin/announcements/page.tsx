import { getAnnouncements } from '@/app/actions/admin-announcements';
import { getCurrentAdmin } from '@/app/actions/admin';
import { AnnouncementsList } from '@/components/admin/announcements-list';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

export default async function AnnouncementsPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    await connection();
    const announcements = await getAnnouncements();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Announcements</h1>
                <p className="text-default-500">Manage site-wide banners and notifications.</p>
            </div>

            <AnnouncementsList announcements={announcements} />
        </div>
    );
}
