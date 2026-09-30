import { Resend } from 'resend';

import { emailFrom, resendApiKey } from '../config';
import type { IEmailService, SendEmailInput } from './types';

export class ResendEmailService implements IEmailService {
    readonly provider = 'resend' as const;
    private client: Resend | null = null;

    private clientOrThrow(): Resend {
        if (!this.client) {
            this.client = new Resend(resendApiKey());
        }
        return this.client;
    }

    async send({ to, subject, html }: SendEmailInput): Promise<void> {
        const { error } = await this.clientOrThrow().emails.send({
            from: emailFrom(),
            to,
            subject,
            html,
        });
        if (error) {
            throw new Error(`Resend send failed: ${error.message}`);
        }
    }
}
