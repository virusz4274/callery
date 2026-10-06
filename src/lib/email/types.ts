// Better Auth verification and recovery share the configured email service.

export interface SendEmailInput {
    to: string;
    subject: string;
    html: string;
}

export interface IEmailService {
    readonly provider: 'resend' | 'smtp';
    send(input: SendEmailInput): Promise<void>;
}
