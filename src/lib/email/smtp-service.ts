import { createTransport } from 'nodemailer';
import type { Mail } from 'nodemailer';

import { emailFrom, smtpConfig } from '../config';
import type { IEmailService, SendEmailInput } from './types';

export class SmtpEmailService implements IEmailService {
    readonly provider = 'smtp' as const;
    private transporter: Mail | null = null;

    private transporterOrThrow(): Mail {
        if (!this.transporter) {
            const { host, port, secure, user, pass } = smtpConfig();
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
        await this.transporterOrThrow().sendMail({
            from: emailFrom(),
            to,
            subject,
            html,
        });
    }
}
