import { z } from 'zod';

export const TeamSettingsSchema = z.object({
    enabled: z.boolean(),
    companyName: z.string().trim().min(1).max(100),
    retentionPolicy: z.enum(['never', '3m', '6m', '1y']),
    transcriptionMode: z.enum(['off', 'manual', 'automatic']),
    transcriptionProvider: z.enum(['soniox', 'elevenlabs', 'gemini', 'openai_compat']),
    transcriptionModel: z.string().trim().max(120).optional(),
}).strict();

export type TeamSettings = z.infer<typeof TeamSettingsSchema>;
export const DEFAULT_TEAM_SETTINGS: TeamSettings = {
    enabled: false, companyName: '', retentionPolicy: 'never',
    transcriptionMode: 'off', transcriptionProvider: 'soniox',
};

export function canAccessTeamRecording(team: TeamSettings, role: 'user' | 'admin', actor: string, uploader: string): boolean {
    return actor === uploader || (team.enabled && role === 'admin');
}

export function canDeleteTeamRecording(team: TeamSettings, role: 'user' | 'admin'): boolean {
    return !team.enabled || role === 'admin';
}

export function isInvitationPending(invite: { status: string; expiresAt: Date } | null, now = new Date()): boolean {
    return invite?.status === 'pending' && invite.expiresAt > now;
}
