import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminAnnouncementSchema, AdminLimitsSchema, AdminPlanSchema, AdminUsageSchema, announcementState, auditCalendarDate, numericInput, quotaPercent, validationFailure } from './admin-validation';
import { safeUsersReturnHref } from './admin-navigation';

test('admin quota inputs reject missing, nonfinite and negative numbers but preserve zero and fractions', () => {
    for (const value of [-1, Infinity, NaN, numericInput('')]) {
        assert.equal(AdminLimitsSchema.safeParse({ storageAllocation: value, transcriptionAllocation: 1 }).success, false);
        assert.equal(AdminUsageSchema.safeParse({ storageUsed: 1, transcriptionUsed: value }).success, false);
    }
    assert.equal(AdminLimitsSchema.safeParse({ storageAllocation: 0, transcriptionAllocation: 600.5 }).success, true);
    assert.equal(numericInput('1.25'), 1.25);
    assert.ok(Number.isNaN(numericInput('3abc')));
    assert.equal(quotaPercent(0, 0), 0);
    assert.equal(quotaPercent(1, 0), 100);
    assert.equal(quotaPercent(3, 2), 100);
});

test('plan validation identifies the field before any save', () => {
    const invalid = AdminPlanSchema.safeParse({ key: ' ', name: '', price: -1, limits: { storage: 0, transcription: Infinity } });
    assert.equal(invalid.success, false);
    if (!invalid.success) assert.deepEqual(Object.keys(validationFailure(invalid.error).fieldErrors), ['key', 'name', 'price', 'limits.transcription']);
});

test('announcement validation and display respect the complete schedule', () => {
    const startDate = new Date('2026-10-07T12:00:00Z');
    for (const endDate of [new Date(startDate), new Date('2026-10-07T11:00:00Z')]) assert.equal(AdminAnnouncementSchema.safeParse({ title: 'Notice', message: 'Update', startDate, endDate }).success, false);
    assert.equal(AdminAnnouncementSchema.safeParse({ title: ' ', message: '', startDate }).success, false);
    assert.equal(AdminAnnouncementSchema.safeParse({ title: 'Notice', message: 'Update', startDate }).success, true);
    const now = startDate.getTime();
    assert.equal(announcementState(false, startDate.toISOString(), undefined, now), 'Inactive');
    assert.equal(announcementState(true, '2099-01-01', undefined, now), 'Scheduled');
    assert.equal(announcementState(true, '2020-01-01', '2021-01-01', now), 'Expired');
    assert.equal(announcementState(true, startDate.toISOString(), undefined, now), 'Visible');
});

test('audit dates round trip through local calendar days', () => {
    const date = new Date(2026, 9, 7, 0, 0, 0);
    assert.equal(auditCalendarDate(date.toISOString()), '2026-10-07');
    assert.equal(auditCalendarDate('bad'), '');
});

test('Users return links retain paging and search but reject other routes and origins', () => {
    assert.equal(safeUsersReturnHref('/admin/users?search=alex&page=2'), '/admin/users?search=alex&page=2');
    for (const value of ['/admin/users/123', '/admin/users-extra', '//other.test/admin/users', 'https://other.test/admin/users', '/admin/users/../settings', null]) assert.equal(safeUsersReturnHref(value), '/admin/users');
});
