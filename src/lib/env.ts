import { z } from 'zod';

const requiredBooleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const requiredNumber = z.string().min(1).transform((value, ctx) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Expected a valid number',
        });

        return z.NEVER;
    }

    return parsed;
});

const envSchema = z.object({
    // Node
    NODE_ENV: z.enum(['development', 'test', 'production']),

    // App URL
    NEXT_PUBLIC_APP_URL: z.string().url(),

    // MongoDB
    MONGODB_URI: z.string().min(1),
    MONGODB_DNS_SERVERS: z.string().optional(),
    MONGODB_CONNECTION_MODE: z.enum(['default', 'fallback-first']),

    // Firebase Client
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
    NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().min(1),

    // Cloudflare R2
    R2_ENDPOINT: z.string().url(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    R2_REGION: z.string().min(1),
    R2_FORCE_PATH_STYLE: requiredBooleanString,

    // Secrets
    UPLOAD_SESSION_SECRET: z.string().min(1),
    SHARE_LINK_SECRET: z.string().min(1),
    MOBILE_SYNC_SESSION_SECRET: z.string().min(1),
    GOOGLE_TOKEN_ENCRYPTION_KEY: z.string().min(1),

    // Auth
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    NEXT_PUBLIC_GOOGLE_REDIRECT_URI: z.string().min(1),

    // Gemini
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
    GEMINI_MODEL_SUMMARY: z.string().min(1),
    GEMINI_MODEL_TRANSLITERATION: z.string().min(1),
    GEMINI_MODEL_EMBEDDING: z.string().min(1),

    // Soniox
    SONIOX_API_KEY: z.string().min(1),
    SONIOX_API_BASE_URL: z.string().url(),
    SONIOX_MODEL_ID: z.string().min(1),
    SONIOX_WEBHOOK_SECRET: z.string().min(1),

    // ElevenLabs
    ELEVENLABS_API_KEY: z.string().min(1),
    ELEVENLABS_API_BASE_URL: z.string().url(),
    ELEVENLABS_MODEL_ID: z.string().min(1),
    ELEVENLABS_WEBHOOK_SECRET: z.string().min(1),

    // Stripe
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),

    // Web Push
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
    VAPID_PRIVATE_KEY: z.string().min(1),
    VAPID_CONTACT_EMAIL: z.string().email(),

    // Email
    SMTP_PORT: requiredNumber,
    SMTP_SECURE: requiredBooleanString,
    SMTP_FROM: z.string().min(1),
    SMTP_HOST: z.string().min(1),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),

    // Cron / Misc
    CRON_SECRET: z.string().min(1),
    EXPORT_JOB_STALE_MINUTES: requiredNumber,
    SOFT_DELETE_RESTORE_DAYS: requiredNumber,
    SUPPORT_EMAIL: z.string().email(),
    GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION: z.string().min(1),

    // Feature Flags
    NEXT_PUBLIC_ENABLE_BILLING: requiredBooleanString,
    NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU: requiredBooleanString,
    CSP_REPORT_ONLY: requiredBooleanString,

});

// For process.env
const processEnv = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DNS_SERVERS: process.env.MONGODB_DNS_SERVERS,
    MONGODB_CONNECTION_MODE: process.env.MONGODB_CONNECTION_MODE,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_REGION: process.env.R2_REGION,
    R2_FORCE_PATH_STYLE: process.env.R2_FORCE_PATH_STYLE,
    UPLOAD_SESSION_SECRET: process.env.UPLOAD_SESSION_SECRET,
    SHARE_LINK_SECRET: process.env.SHARE_LINK_SECRET,
    MOBILE_SYNC_SESSION_SECRET: process.env.MOBILE_SYNC_SESSION_SECRET,
    GOOGLE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NEXT_PUBLIC_GOOGLE_REDIRECT_URI: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    GEMINI_MODEL_SUMMARY: process.env.GEMINI_MODEL_SUMMARY,
    GEMINI_MODEL_TRANSLITERATION: process.env.GEMINI_MODEL_TRANSLITERATION,
    GEMINI_MODEL_EMBEDDING: process.env.GEMINI_MODEL_EMBEDDING,
    SONIOX_API_KEY: process.env.SONIOX_API_KEY,
    SONIOX_API_BASE_URL: process.env.SONIOX_API_BASE_URL,
    SONIOX_MODEL_ID: process.env.SONIOX_MODEL_ID,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_API_BASE_URL: process.env.ELEVENLABS_API_BASE_URL,
    ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_CONTACT_EMAIL: process.env.VAPID_CONTACT_EMAIL,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EXPORT_JOB_STALE_MINUTES: process.env.EXPORT_JOB_STALE_MINUTES,
    SOFT_DELETE_RESTORE_DAYS: process.env.SOFT_DELETE_RESTORE_DAYS,
    SONIOX_WEBHOOK_SECRET: process.env.SONIOX_WEBHOOK_SECRET,
    ELEVENLABS_WEBHOOK_SECRET: process.env.ELEVENLABS_WEBHOOK_SECRET,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
    CRON_SECRET: process.env.CRON_SECRET,
    GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION,
    NEXT_PUBLIC_ENABLE_BILLING: process.env.NEXT_PUBLIC_ENABLE_BILLING,
    NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU: process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU,
    CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY,
};

// Validate
const parsed = envSchema.safeParse(processEnv);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
}

export const env = parsed.data;
