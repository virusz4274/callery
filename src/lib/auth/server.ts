// Better Auth for every deployment. Credentials and connections are lazy.
import { APIError } from "better-auth/api";
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { bearer } from 'better-auth/plugins/bearer';
import { nextCookies } from 'better-auth/next-js';
import { ObjectId, type Db } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { getAuthCapabilities, getAuthSecret, getGoogleCredentials } from './config';
import { ensureUserProfile, findUserByAuthSubject } from '@/lib/db/users';
import { assertSignupAllowed } from '@/lib/team-invitations';
import { getTeamSettings } from '@/lib/team-policy';
import { sendAuthEmail } from '@/lib/email';
import type { SessionUser } from './types';

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function verifyEmailTemplate(name: string, url: string): string {
    const safeName = escapeHtml(name);
    return `<p>Hi ${safeName},</p><p>Thanks for signing up for Vosift. Please verify your email address:</p><p><a href="${url}">Verify email</a></p><p>If you didn't create this account, you can ignore this email.</p>`;
}

function resetPasswordTemplate(name: string, url: string): string {
    const safeName = escapeHtml(name);
    return `<p>Hi ${safeName},</p><p>We received a request to reset your Vosift password:</p><p><a href="${url}">Reset password</a></p><p>If you didn't request this, you can ignore this email.</p>`;
}

/**
 * Build the better-auth instance. Env is read here — never at import
 * time — so builds never require runtime credentials or a database connection.
 */
export function createAuth(db: Db, sendEmail: typeof sendAuthEmail = sendAuthEmail) {
    const secret = getAuthSecret();
    const google = getGoogleCredentials();
    // EMAIL_PROVIDER=none means no sender exists, so accounts verify
    // implicitly (dev mode). Any real provider requires verification.
    const emailsEnabled = getAuthCapabilities().emailVerificationRequired;
    const syncProfile = async (user: { id: string; email: string; name?: string | null; image?: string | null; emailVerified?: boolean }) => {
        await ensureUserProfile(user.id, user.email, user.name ?? undefined, user.image ?? undefined, user.emailVerified === true);
    };

    return betterAuth({
        baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000',
        secret,
        advanced: { disableOriginCheck: false, disableCSRFCheck: false },
        database: mongodbAdapter(db, { transaction: false }),
        disabledPaths: emailsEnabled ? [] : ['/request-password-reset', '/reset-password', '/send-verification-email'],
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: emailsEnabled,
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }) => {
                await sendEmail({
                    to: user.email,
                    subject: 'Reset your Vosift password',
                    html: resetPasswordTemplate(user.name, url),
                });
            },
        },
        emailVerification: {
            sendOnSignUp: emailsEnabled,
            afterEmailVerification: syncProfile,
            sendVerificationEmail: async ({ user, url }) => {
                await sendEmail({
                    to: user.email,
                    subject: 'Verify your Vosift email',
                    html: verifyEmailTemplate(user.name, url),
                });
            },
        },
        ...(google
            ? { socialProviders: { google } }
            : {}),
        plugins: [bearer(), nextCookies()],
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        try { await assertSignupAllowed(user.email); }
                        catch (error) { throw new APIError('FORBIDDEN', { message: error instanceof Error ? error.message : 'Registration unavailable.' }); }
                        if ((await getTeamSettings()).enabled && !emailsEnabled) throw new APIError('FORBIDDEN', { message: 'Company signup requires email verification. Contact the administrator.' });
                        return { data: { ...user, emailVerified: user.emailVerified || !emailsEnabled } };
                    },
                    after: syncProfile,
                },
            },
            session: {
                create: {
                    before: async (session) => {
                        const profile = await findUserByAuthSubject(session.userId);
                        if (profile?.disabled || profile?.softDelete?.isDeleted) {
                            throw new APIError('FORBIDDEN', { message: 'Account disabled.' });
                        }
                        const user = await db.collection<{ _id: ObjectId; email: string; name?: string; image?: string; emailVerified?: boolean }>('user').findOne({ _id: new ObjectId(session.userId) });
                        if (user) await syncProfile({ ...user, id: session.userId });
                        if ((await getTeamSettings()).enabled && !user?.emailVerified) throw new APIError('FORBIDDEN', { message: 'Verify your company email before signing in.' });
                        return { data: session };
                    },
                },
            },
        },
    });
}

type Auth = ReturnType<typeof createAuth>;

let auth: Promise<Auth> | undefined;

/**
 * Lazily create (and cache) the better-auth instance.
 */
export function getAuth(): Promise<Auth> {
    if (!auth) {
        auth = Promise.resolve().then(() => {
            getAuthSecret();
            getAuthCapabilities();
            return getMongoDb();
        }).then(db => createAuth(db)).catch(error => {
            auth = undefined;
            throw error;
        });
    }
    return auth;
}

/**
 * Resolve the session from request headers. Accepts Better Auth
 * session cookies (web app) and `Authorization: Bearer <session-token>`
 * (API clients) via the bearer plugin.
 */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
    const session = await (await getAuth()).api.getSession({ headers });
    if (!session?.user) return null;
    return {
        subject: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        emailVerified: session.user.emailVerified,
    };
}
