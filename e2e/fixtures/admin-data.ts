import type { AnnouncementResponse, PlanResponse, UserResponse } from '../../src/lib/db/types';

export const adminProfile: UserResponse = {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Admin Fixture', email: 'admin@example.test', firstName: 'Admin', lastName: 'Fixture',
    phoneNumber: '', role: 'admin', timezone: 'UTC', planKey: 'standard', planName: 'Standard', createdAt: '2026-01-01T00:00:00Z',
    storageUsed: 1.25 * 1024 ** 3, storageAllocation: 2.5 * 1024 ** 3, transcriptionUsed: 90, transcriptionAllocation: 600.5,
    notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false }, storageSettings: { deletionPolicy: 'never' },
    transcriptionSettings: { autoTranscribe: false }, billingSettings: { allowOverage: false }, totalRecordings: 0,
    googleSync: { status: 'completed', hasRefreshToken: false },
};
export const adminUsers: UserResponse[] = Array.from({ length: 25 }, (_, i) => ({
    ...adminProfile, id: i.toString(16).padStart(24, '0'), role: i === 0 ? 'admin' : 'user',
    name: i === 0 ? 'Alexandria Catherine Montgomery With A Very Long Administrator Name' : `User ${String(i).padStart(2, '0')}`,
    email: i === 0 ? 'long.email.address.for.the.administrator@example.test' : `user${i}@example.test`,
    storageAllocation: i === 1 ? 0 : adminProfile.storageAllocation,
    transcriptionAllocation: i === 1 ? 0 : adminProfile.transcriptionAllocation,
    disabled: i === 2,
}));
export const adminPlans: PlanResponse[] = [{
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb', key: 'standard', name: 'Standard', price: 0, currency: 'USD', interval: 'monthly',
    stripePriceId: '', features: [], isActive: false, isDefault: true,
    limits: { storage: 2.5 * 1024 ** 3, transcription: 600.5 }, createdAt: adminProfile.createdAt, updatedAt: adminProfile.createdAt,
}, {
    id: 'cccccccccccccccccccccccc', key: 'pro', name: 'Professional plan with a long descriptive name', price: 19.5, currency: 'USD', interval: 'monthly',
    stripePriceId: '', features: ['Search', 'Transcription'], isActive: true, isDefault: false,
    limits: { storage: 5 * 1024 ** 3, transcription: 3600 }, createdAt: adminProfile.createdAt, updatedAt: adminProfile.createdAt,
}];
export const adminAnnouncements: AnnouncementResponse[] = ['Visible', 'Scheduled', 'Expired', 'Inactive'].map((state, i) => ({
    id: String(i), title: i === 0 ? 'A long announcement title that wraps alongside its severity and schedule state' : `${state} notice`,
    message: 'A useful announcement for the workspace.', type: i === 0 ? 'alert' : 'info', isActive: state !== 'Inactive',
    startDate: state === 'Scheduled' ? '2099-01-01T00:00:00Z' : '2020-01-01T00:00:00Z',
    endDate: state === 'Expired' ? '2021-01-01T00:00:00Z' : undefined,
    createdAt: adminProfile.createdAt, createdBy: adminProfile.id,
}));
