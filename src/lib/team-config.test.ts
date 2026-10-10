import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TEAM_SETTINGS, TeamSettingsSchema, canAccessTeamRecording, canDeleteTeamRecording, isInvitationPending } from './team-config';

test('team access grants administrators company visibility while personal admins stay account-scoped', () => {
    const team = { ...DEFAULT_TEAM_SETTINGS, enabled: true, companyName: 'Small team' };
    for (const role of ['user', 'admin'] as const) {
        assert.equal(canAccessTeamRecording(team, role, 'member', 'member'), true);
        assert.equal(canAccessTeamRecording(team, role, 'member', 'other'), role === 'admin');
        assert.equal(canAccessTeamRecording(DEFAULT_TEAM_SETTINGS, role, 'member', 'other'), false);
        assert.equal(canDeleteTeamRecording(team, role), role === 'admin');
        assert.equal(canDeleteTeamRecording(DEFAULT_TEAM_SETTINGS, role), true);
    }
    assert.equal(DEFAULT_TEAM_SETTINGS.retentionPolicy, 'never');
    assert.equal(DEFAULT_TEAM_SETTINGS.transcriptionMode, 'off');
});

test('only pending, unexpired invitations admit signup; expiry is exclusive', () => {
    const now = new Date('2026-10-08');
    for (const status of ['pending', 'accepted', 'revoked']) {
        for (const offset of [-1, 0, 1]) {
            assert.equal(isInvitationPending({ status, expiresAt: new Date(now.getTime() + offset) }, now), status === 'pending' && offset > 0);
        }
    }
    assert.equal(isInvitationPending(null, now), false);
});

test('company settings reject invented roles, policies and hidden fields', () => {
    const valid = { ...DEFAULT_TEAM_SETTINGS, companyName: ' Team ' };
    assert.equal(TeamSettingsSchema.parse(valid).companyName, 'Team');
    for (const patch of [{ companyName: '' }, { retentionPolicy: '1d' }, { transcriptionMode: 'optional' }, { allowSignups: true }, { enabled: 'true' }]) {
        assert.equal(TeamSettingsSchema.safeParse({ ...valid, ...patch }).success, false);
    }
});
