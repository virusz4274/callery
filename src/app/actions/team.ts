'use server';

import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireCurrentAdmin } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { getRequiredSystemSettings } from '@/lib/db/users';
import { updateSystemSettingsDocument } from '@/lib/db/system-settings';
import { getTeamSettings, withTeamAccessLock } from '@/lib/team-policy';
import { TeamSettingsSchema, type TeamSettings } from '@/lib/team-config';
import { billingEnabled, emailProvider } from '@/lib/config';
import { sendNotificationEmail } from '@/lib/email';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import { TranscriptionFactory } from '@/services/transcription/factory';
import type { TeamInvitation } from '@/lib/team-invitations';
import type { Recording, User } from '@/lib/db/types';
import { toRecordingResponse } from '@/lib/db/converters';
import { buildRecordingsQuery } from '@/lib/db/recordings/query-utils';
import { hydrateRecordingContacts } from '@/lib/db/recordings/hydrate-contacts';
import { logAdminAction } from './audit-log';

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function saveTeamSettings(input: TeamSettings) {
    const admin = await requireCurrentAdmin();
    const data = TeamSettingsSchema.parse(input);
    return withTeamAccessLock(async () => {
        const current = await getTeamSettings();
        if (current.enabled && !data.enabled) throw new Error('A company archive cannot switch back to personal mode.');
        if (data.enabled && billingEnabled()) throw new Error('Team mode requires a self-host deployment with billing disabled.');
        if (data.enabled && emailProvider() === 'none') throw new Error('Configure SMTP or Resend before enabling team mode.');
        if (data.enabled && data.transcriptionMode !== 'off' && !TranscriptionFactory.isProviderAvailable(data.transcriptionProvider)) {
            throw new Error('The selected transcription provider is not configured.');
        }
        const db = await getMongoDb();
        if (data.enabled && !current.enabled) {
            const identity = await db.collection('user').findOne({ _id: new ObjectId(admin.authSubject) });
            if (!identity?.emailVerified) throw new Error('Verify your administrator email first.');
            if (await db.collection(Collections.USERS).countDocuments({ 'softDelete.isDeleted': true })) {
                throw new Error('Restore accounts scheduled for deletion before adopting the company archive.');
            }
            // A real send verifies the configured sender can deliver setup mail.
            const sent = await sendNotificationEmail({ to: admin.email, subject: `${data.companyName}: team setup`,
                html: '<p>Your company archive is being enabled. Employees will need an invitation, and the administrator can access their uploaded recordings.</p>' });
            if (!sent) throw new Error('Company setup requires working email delivery.');
        }
        await updateSystemSettingsDocument({ team: data, ...(data.enabled ? { allowSignups: false } : {}) });
        await logAdminAction(admin._id.toString(), 'SETTINGS_UPDATE', { team: data }, 'system', 'SYSTEM');
        revalidatePath('/', 'layout');
        return { success: true as const };
    });
}

export async function getTeamAdministration() {
    await requireCurrentAdmin();
    const team = await getTeamSettings();
    if (!team.enabled) return null;
    const db = await getMongoDb();
    const [invitations, employees] = await Promise.all([
        db.collection<TeamInvitation>(Collections.TEAM_INVITATIONS).find({ status: { $ne: 'accepted' } }).sort({ updatedAt: -1 }).limit(100).toArray(),
        db.collection<User>(Collections.USERS).find({}).sort({ name: 1 }).toArray(),
    ]);
    return {
        team,
        invitations: invitations.map(i => ({ id: i._id.toString(), email: i.email, status: i.status, expiresAt: i.expiresAt.toISOString() })),
        employees: employees.map(u => ({ id: u._id.toString(), name: u.name || u.email, email: u.email,
            disabled: !!u.disabled, role: u.role, storageUsed: u.storageUsed, totalRecordings: u.totalRecordings })),
        storageUsed: employees.reduce((sum, u) => sum + u.storageUsed, 0),
    };
}

export async function inviteTeamMember(rawEmail: string) {
    const admin = await requireCurrentAdmin();
    const email = z.string().trim().toLowerCase().email().max(254).parse(rawEmail);
    const team = await getTeamSettings();
    if (!team.enabled) throw new Error('Enable company setup first.');
    const db = await getMongoDb();
    const profile = await db.collection<User>(Collections.USERS).findOne({ email });
    if (profile && !profile.teamInvitationPending) throw new Error('This employee already has an account. Manage their access in the user list.');
    const now = new Date();
    // One invitation per email; re-sending renews its validity and never creates another account.
    await db.collection<TeamInvitation>(Collections.TEAM_INVITATIONS).updateOne({ email }, {
        $set: { status: 'pending', expiresAt: new Date(now.getTime() + 7 * 86400_000), inviter: admin.authSubject, updatedAt: now },
        $unset: { acceptedBy: '' }, $setOnInsert: { createdAt: now },
    }, { upsert: true });
    const url = new URL('/signup', getConfiguredPublicAppOrigin());
    url.searchParams.set('email', email);
    const sent = await sendNotificationEmail({ to: email, subject: `Join ${team.companyName} on Vosift`,
        html: `<p>You have been invited to ${escapeHtml(team.companyName)}.</p><p><a href="${escapeHtml(url.toString())}">Create your account</a> and verify this email address within seven days.</p><p>Recordings you upload belong to this company archive and can be accessed by its administrator.</p>` });
    if (!sent) throw new Error('Email delivery is unavailable. Configure SMTP or Resend and resend the invitation.');
    await logAdminAction(admin._id.toString(), 'TEAM_INVITE', { email }, undefined, 'USER');
    revalidatePath('/admin/users');
    return { success: true as const };
}

export async function revokeTeamInvitation(id: string) {
    const admin = await requireCurrentAdmin();
    if (!(await getTeamSettings()).enabled || !ObjectId.isValid(id)) throw new Error('Invalid invitation');
    const db = await getMongoDb();
    await db.collection<TeamInvitation>(Collections.TEAM_INVITATIONS).updateOne({ _id: new ObjectId(id), status: 'pending' }, { $set: { status: 'revoked', updatedAt: new Date() } });
    await logAdminAction(admin._id.toString(), 'TEAM_INVITE_REVOKE', {}, id, 'USER');
    revalidatePath('/admin/users');
}

export async function getCompanyRecordings(input: { page?: number; employeeId?: string; search?: string; startDate?: string; endDate?: string } = {}) {
    await requireCurrentAdmin();
    if (!(await getRequiredSystemSettings()).team?.enabled) throw new Error('Company archive is not enabled.');
    const options = z.object({
        page: z.number().int().min(1).max(100_000).default(1), employeeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
        search: z.string().trim().max(200).optional(), startDate: z.iso.date().optional(), endDate: z.iso.date().optional(),
    }).strict().parse(input);
    const db = await getMongoDb();
    const users = await db.collection<User>(Collections.USERS).find({}).toArray();
    const employee = options.employeeId ? users.find(u => u._id.toString() === options.employeeId) : null;
    if (options.employeeId && !employee) throw new Error('Employee not found');
    const query = buildRecordingsQuery(employee?.authSubject || '', { ...options, includeArchived: true });
    if (!employee) delete query.authSubject;
    const limit = 25;
    const [rows, total] = await Promise.all([
        db.collection<Recording>(Collections.RECORDINGS).find(query).sort({ recordedAt: -1, _id: -1 }).skip((options.page - 1) * limit).limit(limit).toArray(),
        db.collection<Recording>(Collections.RECORDINGS).countDocuments(query),
    ]);
    const bySubject = new Map(users.map(u => [u.authSubject, u]));
    const hydrated = (await Promise.all([...new Set(rows.map(r => r.authSubject))].map(subject => hydrateRecordingContacts(subject, rows.filter(r => r.authSubject === subject))))).flat();
    const byId = new Map(hydrated.map(r => [r._id.toString(), r]));
    return { total, page: options.page, totalPages: Math.max(1, Math.ceil(total / limit)),
        recordings: rows.map(r => ({ ...toRecordingResponse(byId.get(r._id.toString()) || r),
            uploaderName: bySubject.get(r.authSubject)?.name || bySubject.get(r.authSubject)?.email || 'Former employee' })),
    };
}
