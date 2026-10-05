import { emailFrom, smtpConfig } from '../config';
import type { IEmailService, SendEmailInput } from './types';

// nodemailer is imported lazily (see transporterOrThrow): it pulls Node-only
// networking that cannot run on edge runtimes. EMAIL_PROVIDER=smtp is a
// Node/self-host deployment option — use EMAIL_PROVIDER=resend on Workers.

type SmtpTransporter = Pick<import('nodemailer').Transporter, 'sendMail'>;

export class SmtpEmailService implements IEmailService {
    readonly provider = 'smtp' as const;
    private transporter: SmtpTransporter | null = null;

    private async transporterOrThrow(): Promise<SmtpTransporter> {
        if (!this.transporter) {
            const { host, port, secure, user, pass } = smtpConfig();
            let createTransport: typeof import('nodemailer').createTransport;
            try {
                ({ createTransport } = await import('nodemailer'));
            } catch {
                throw new Error(
                    'EMAIL_PROVIDER=smtp requires a Node.js runtime (nodemailer). ' +
                    'On Cloudflare Workers, use EMAIL_PROVIDER=resend instead.',
                );
            }
            this.transporter = createTransport({
                host,
                port,
                secure,
                ...(user && pass ? { auth: { user, pass } } : {}),
            });
        }
        return this.transporter;
    }

    async send({ to, subject, html }: SendEmailInput): Promise<void> {
        await (await this.transporterOrThrow()).sendMail({
            from: emailFrom(),
            to,
            subject,
            html,
        });
    }
}
