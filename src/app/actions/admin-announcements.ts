'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { Announcement, CreateAnnouncementInput, UpdateAnnouncementInput, AnnouncementResponse } from '@/lib/db/types';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

/**
 * Map DB document to response object
 */
function mapAnnouncement(announcement: Announcement): AnnouncementResponse {
    return {
        id: announcement._id.toString(),
        title: announcement.title,
        message: announcement.message,
        type: announcement.type,
        isActive: announcement.isActive,
        startDate: announcement.startDate.toISOString(),
        endDate: announcement.endDate?.toISOString(),
        createdAt: announcement.createdAt.toISOString(),
    };
}

/**
 * Get all announcements (for admin view)
 */
export async function getAnnouncements() {
    const db = await getMongoDb();
    const announcements = await db.collection<Announcement>(Collections.ANNOUNCEMENTS)
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

    return announcements.map(mapAnnouncement);
}

/**
 * Get active announcements (for user banner)
 */
export async function getActiveAnnouncements() {
    const db = await getMongoDb();
    const now = new Date();

    const announcements = await db.collection<Announcement>(Collections.ANNOUNCEMENTS)
        .find({
            isActive: true,
            startDate: { $lte: now },
            $or: [
                { endDate: { $exists: false } },
                { endDate: null as unknown as Date },
                { endDate: { $gt: now } }
            ]
        })
        .sort({ startDate: -1 })
        .toArray();

    return announcements.map(mapAnnouncement);
}

/**
 * Create a new announcement
 */
import { getCurrentAdmin } from '@/lib/admin-auth';
import { logAdminAction } from '@/app/actions/audit-log';

/**
 * Create a new announcement
 */
export async function createAnnouncement(data: CreateAnnouncementInput) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();
    const now = new Date();

    const announcementDoc: Announcement = {
        _id: new ObjectId(),
        ...data,
        createdAt: now,
        createdBy: admin._id,
    };

    const result = await db.collection(Collections.ANNOUNCEMENTS).insertOne(announcementDoc);

    await logAdminAction(
        admin._id.toString(),
        'ANNOUNCEMENT_CREATE',
        { title: data.title, type: data.type },
        result.insertedId.toString(),
        'ANNOUNCEMENT'
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/dashboard'); // Update user dashboard
}

/**
 * Update an announcement
 */
export async function updateAnnouncement(id: string, data: UpdateAnnouncementInput) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();

    // Prepare update data (handle dates specifically if string/Date mismatch occurs via JSON)
    // Assuming inputs are correct Dates from server action call

    await db.collection(Collections.ANNOUNCEMENTS).updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                ...data,
                updatedAt: new Date()
            }
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'ANNOUNCEMENT_UPDATE',
        { announcementId: id, updates: data },
        id,
        'ANNOUNCEMENT'
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/dashboard');
}

/**
 * Delete an announcement
 */
export async function deleteAnnouncement(id: string) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();
    const announcement = await db.collection<Announcement>(Collections.ANNOUNCEMENTS).findOne({ _id: new ObjectId(id) });

    await db.collection(Collections.ANNOUNCEMENTS).deleteOne({ _id: new ObjectId(id) });

    await logAdminAction(
        admin._id.toString(),
        'ANNOUNCEMENT_DELETE',
        { title: announcement?.title, announcementId: id },
        id,
        'ANNOUNCEMENT'
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/dashboard');
}
