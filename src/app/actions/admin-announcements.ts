'use server';

import { logAdminAction } from '@/app/actions/audit-log';
import { Announcement, AnnouncementResponse, CreateAnnouncementInput, UpdateAnnouncementInput } from '@/lib/db/types';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

/**
 * Map DB document to response object.
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

function revalidateAnnouncementPages() {
    revalidatePath('/admin/announcements');
    revalidatePath('/recordings');
}

/**
 * Get all announcements (for admin view).
 */
export async function getAnnouncements() {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const announcements = await db
        .collection<Announcement>(Collections.ANNOUNCEMENTS)
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

    return announcements.map(mapAnnouncement);
}

/**
 * Get active announcements (for user banner).
 */
export async function getActiveAnnouncements() {
    try {
        const db = await getMongoDb();
        const now = new Date();

        const activeFilter: Record<string, unknown> = {
            isActive: true,
            startDate: { $lte: now },
            $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gt: now } }],
        };

        const announcements = await db
            .collection<Announcement>(Collections.ANNOUNCEMENTS)
            .find(activeFilter)
            .sort({ startDate: -1 })
            .toArray();

        return announcements.map(mapAnnouncement);
    } catch (error) {
        console.warn('Failed to fetch active announcements, using fallback:', error);
        return [];
    }
}

/**
 * Create a new announcement.
 */
export async function createAnnouncement(data: CreateAnnouncementInput) {
    const admin = await requireCurrentAdmin();

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

    revalidateAnnouncementPages();
}

/**
 * Update an announcement.
 */
export async function updateAnnouncement(id: string, data: UpdateAnnouncementInput) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const announcementObjectId = parseObjectId(id, 'announcementId');

    await db.collection(Collections.ANNOUNCEMENTS).updateOne(
        { _id: announcementObjectId },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            },
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'ANNOUNCEMENT_UPDATE',
        { announcementId: id, updates: data },
        id,
        'ANNOUNCEMENT'
    );

    revalidateAnnouncementPages();
}

/**
 * Delete an announcement.
 */
export async function deleteAnnouncement(id: string) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const announcementObjectId = parseObjectId(id, 'announcementId');

    const announcement = await db
        .collection<Announcement>(Collections.ANNOUNCEMENTS)
        .findOne({ _id: announcementObjectId });

    await db.collection(Collections.ANNOUNCEMENTS).deleteOne({ _id: announcementObjectId });

    await logAdminAction(
        admin._id.toString(),
        'ANNOUNCEMENT_DELETE',
        { title: announcement?.title, announcementId: id },
        id,
        'ANNOUNCEMENT'
    );

    revalidateAnnouncementPages();
}
