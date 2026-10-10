import type { RecordingResponse } from '../../src/lib/db/types';
import { DEFAULT_TEAM_SETTINGS } from '../../src/lib/team-config';
import { adminUsers } from './admin-data';

export const teamSettings = { ...DEFAULT_TEAM_SETTINGS, enabled: true, companyName: 'Pilot Company' };
export const teamAdministration = {
    team: teamSettings, storageUsed: 1024 ** 3,
    invitations: [{ id: 'eeeeeeeeeeeeeeeeeeeeeeee', email: 'pending@example.test', status: 'pending' as const, expiresAt: '2099-01-01T00:00:00Z' }],
    employees: adminUsers.slice(0, 3).map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, disabled: !!u.disabled, storageUsed: u.storageUsed, totalRecordings: u.totalRecordings })),
};
export const companyRecording: RecordingResponse & { uploaderName: string } = {
    id: 'dddddddddddddddddddddddd', authSubject: adminUsers[1].id, uploaderName: adminUsers[1].name,
    contactId: null, contactName: 'Phone customer', phoneNumber: '+919876543210',
    r2Key: 'fixture/audio.wav', fileName: 'CallRecord_20260925-153045_+919876543210.wav', standardizedDisplayName: 'Phone customer',
    fileSize: 16044, mimeType: 'audio/wav', duration: 1, recordedAt: '2026-09-25T10:00:45Z', createdAt: '2026-09-25T10:00:45Z', updatedAt: '2026-09-25T10:00:45Z',
    transcriptionStatus: 'pending', tags: [], isStarred: false, isArchived: false,
};
