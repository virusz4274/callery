import { getAnnouncements } from '@/app/actions/admin-announcements';
import { AnnouncementsList } from '@/components/admin/announcements-list';

export default async function AnnouncementsPage() {
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
