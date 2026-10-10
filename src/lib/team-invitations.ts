import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from './mongodb';
import { getTeamSettings } from './team-policy';
import { getRequiredSystemSettings } from './db/users';
import { isBootstrapAdminEmail } from './admin-bootstrap';
import { isInvitationPending } from './team-config';

export interface TeamInvitation {
    _id: ObjectId;
    email: string;
    expiresAt: Date;
    status: 'pending' | 'accepted' | 'revoked';
    inviter: string;
    createdAt: Date;
    updatedAt: Date;
    acceptedBy?: string;
}

export async function assertSignupAllowed(email: string, existingSubject?: string): Promise<void> {
    const settings = await getRequiredSystemSettings();
    if (!settings.team?.enabled) {
        if (!settings.allowSignups) throw new Error('New signups are currently disabled.');
        return;
    }
    if (isBootstrapAdminEmail(email)) return;
    const db = await getMongoDb();
    const invite = await db.collection<TeamInvitation>(Collections.TEAM_INVITATIONS).findOne({ email: email.trim().toLowerCase() });
    if (!isInvitationPending(invite) && !(existingSubject && invite?.status === 'accepted' && invite.acceptedBy === existingSubject)) throw new Error('Ask your company administrator for a current invitation.');
}

export async function acceptTeamInvitation(email: string, subject: string): Promise<void> {
    if (!(await getTeamSettings()).enabled || isBootstrapAdminEmail(email)) return;
    const db = await getMongoDb();
    const accepted = await db.collection<TeamInvitation>(Collections.TEAM_INVITATIONS).findOneAndUpdate({
        email: email.trim().toLowerCase(),
        $or: [
            { status: 'pending', expiresAt: { $gt: new Date() } },
            { status: 'accepted', acceptedBy: subject },
        ],
    }, { $set: { status: 'accepted', acceptedBy: subject, updatedAt: new Date() } });
    if (!accepted) throw new Error('Your invitation expired or was revoked. Ask the administrator to resend it.');
}
