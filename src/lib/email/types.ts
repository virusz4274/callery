// Email provider seam. Local auth (better-auth) sends verification and
// password-reset mails through this interface; Firebase mode keeps using
// Firebase's own emails and never touches these services.

export interface SendEmailInput {
    to: string;
    subject: string;
    html: string;
}

export interface IEmailService {
    readonly provider: 'resend' | 'smtp';
    send(input: SendEmailInput): Promise<void>;
}
