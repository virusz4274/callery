// Local (self-hosted) implementation of the server auth seam, powered by
// better-auth with sessions stored in the existing MongoDB.
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { bearer } from 'better-auth/plugins/bearer';
import { nextCookies } from 'better-auth/next-js';
import { MongoClient } from 'mongodb';
import { adminEmails, emailProvider, mongoUri } from '@/lib/config';
import { ensureUserProfile, setUserRole } from '@/lib/db/users';
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
 * time — so builds and Firebase-mode requests never require local-auth
 * credentials. Only called via getLocalAuth() below.
 */
function createLocalAuth() {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error('Missing BETTER_AUTH_SECRET environment variable (required for AUTH_PROVIDER=local). See .env.example.');
    }

    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    // EMAIL_PROVIDER=none means no sender exists, so accounts verify
    // implicitly (dev mode). Any real provider requires verification.
    const emailsEnabled = emailProvider() !== 'none';

    return betterAuth({
        baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000',
        secret,
        database: mongodbAdapter(new MongoClient(mongoUri()).db()),
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: emailsEnabled,
            sendResetPassword: async ({ user, url }) => {
                await sendAuthEmail({
                    to: user.email,
                    subject: 'Reset your Vosift password',
                    html: resetPasswordTemplate(user.name, url),
                });
            },
        },
        emailVerification: {
            sendOnSignUp: emailsEnabled,
            sendVerificationEmail: async ({ user, url }) => {
                await sendAuthEmail({
                    to: user.email,
                    subject: 'Verify your Vosift email',
                    html: verifyEmailTemplate(user.name, url),
                });
            },
        },
        ...(googleClientId && googleClientSecret
            ? { socialProviders: { google: { clientId: googleClientId, clientSecret: googleClientSecret } } }
            : {}),
        plugins: [bearer(), nextCookies()],
        databaseHooks: {
            user: {
                create: {
                    after: async (user) => {
                        const { user: profile } = await ensureUserProfile(
                            user.id,
                            user.email,
                            user.name ?? undefined,
                            user.image ?? undefined,
                            'local',
                        );
                        if (adminEmails().includes(user.email)) {
                            await setUserRole(profile.authSubject, 'admin');
                        }
                    },
                },
            },
        },
    });
}

type LocalAuth = ReturnType<typeof createLocalAuth>;

let auth: LocalAuth | undefined;

/**
 * Lazily create (and cache) the better-auth instance.
 */
export function getLocalAuth(): LocalAuth {
    if (!auth) auth = createLocalAuth();
    return auth;
}

/**
 * Resolve the local session from request headers. Accepts better-auth
 * session cookies (web app) and `Authorization: Bearer <session-token>`
 * (API clients) via the bearer plugin.
 */
export async function getLocalSessionUser(headers: Headers): Promise<SessionUser | null> {
    try {
        const session = await getLocalAuth().api.getSession({ headers });
        if (!session?.user) return null;
        return {
            subject: session.user.id,
            email: session.user.email,
            name: session.user.name ?? null,
            image: session.user.image ?? null,
            provider: 'local',
        };
    } catch {
        return null;
    }
}
