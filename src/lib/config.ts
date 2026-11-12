import { publicEnv } from './public-env';

// Canonical lazy server configuration; public-env contains only browser-safe values.
// Server-side only. All accessors are lazy (plain functions) so importing
// this module never throws — validation failures surface on first use with
// an actionable message naming the missing variable. This keeps `next build`
// (which imports route modules) working without runtime secrets present.

export type EmailProvider = 'resend' | 'smtp' | 'none';
export type TranscriptionProvider = 'soniox' | 'elevenlabs' | 'gemini' | 'openai_compat';
export type AiProvider = 'gemini' | 'openai_compat';

function oneOf<T extends string>(
    name: string,
    value: string | undefined,
    allowed: readonly T[],
    fallback: T,
): T {
    if (!value) return fallback;
    if ((allowed as readonly string[]).includes(value)) return value as T;
    throw new Error(
        `Invalid ${name}=${JSON.stringify(value)}. Expected one of: ${allowed.join(', ')}. See .env.example.`,
    );
}

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing ${name} environment variable. See .env.example.`);
    }
    return value;
}

/** Which email backend sends verification/reset mails. Default: none (dev). */
export function emailProvider(): EmailProvider {
    return oneOf('EMAIL_PROVIDER', process.env.EMAIL_PROVIDER, ['resend', 'smtp', 'none'] as const, 'none');
}

/** Sender identity for verification/reset mails. Required when EMAIL_PROVIDER is resend or smtp. */
export function emailFrom(): string {
    return required('EMAIL_FROM');
}

/** Resend API key. Required when EMAIL_PROVIDER=resend. */
export function resendApiKey(): string {
    return required('RESEND_API_KEY');
}

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
}

/** SMTP relay config. Only required when EMAIL_PROVIDER=smtp. */
export function smtpConfig(): SmtpConfig {
    const host = serverEnv.SMTP_HOST;
    if (!host) {
        throw new Error('Missing SMTP_HOST environment variable (EMAIL_PROVIDER=smtp). See .env.example.');
    }
    return {
        host,
        port: serverEnv.SMTP_PORT,
        secure: serverEnv.SMTP_SECURE,
        user: serverEnv.SMTP_USER || undefined,
        pass: serverEnv.SMTP_PASS || undefined,
    };
}

/**
 * Whether Stripe billing is active. Default OFF: self-hosted instances run
 * without billing unless the operator opts in. Managed SaaS sets
 * NEXT_PUBLIC_ENABLE_BILLING=true.
 */
export function billingEnabled(): boolean {
    return publicEnv.NEXT_PUBLIC_ENABLE_BILLING;
}

/** Default transcription backend; users may override per-account. */
export function transcriptionProvider(): TranscriptionProvider {
    return oneOf(
        'TRANSCRIPTION_PROVIDER',
        process.env.TRANSCRIPTION_PROVIDER,
        ['soniox', 'elevenlabs', 'gemini', 'openai_compat'] as const,
        'soniox',
    );
}

/** Text-AI backend (summaries, transliteration, embeddings). Default: gemini. */
export function aiProvider(): AiProvider {
    return oneOf(
        'AI_PROVIDER',
        process.env.AI_PROVIDER,
        ['gemini', 'openai_compat'] as const,
        'gemini',
    );
}

export interface CompatTextConfig {
    /** Chat + embeddings server, OpenAI API shape. Include the version path (e.g. .../v1). */
    baseUrl: string;
    /** Optional: local servers (Ollama etc.) need no key. */
    apiKey?: string;
    chatModel: string;
    embeddingModel: string;
}

export interface CompatTranscriptionConfig {
    /** Whisper-API server. Include the version path (e.g. .../v1). */
    baseUrl: string;
    /** Optional: local Whisper servers need no key. */
    apiKey?: string;
    model: string;
}

function stripTrailingSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** OpenAI-compatible text config, or undefined when incompletely configured. */
export function compatTextConfig(): CompatTextConfig | undefined {
    const baseUrl = process.env.OPENAI_COMPAT_BASE_URL;
    const chatModel = process.env.OPENAI_COMPAT_CHAT_MODEL;
    const embeddingModel = process.env.OPENAI_COMPAT_EMBEDDING_MODEL;
    if (!baseUrl || !chatModel || !embeddingModel) return undefined;
    return {
        baseUrl: stripTrailingSlash(baseUrl),
        apiKey: process.env.OPENAI_COMPAT_API_KEY || undefined,
        chatModel,
        embeddingModel,
    };
}

/** OpenAI-compatible transcription config, or undefined when incompletely configured. */
export function compatTranscriptionConfig(): CompatTranscriptionConfig | undefined {
    const baseUrl = process.env.TRANSCRIPTION_COMPAT_BASE_URL;
    const model = process.env.TRANSCRIPTION_COMPAT_MODEL;
    if (!baseUrl || !model) return undefined;
    return {
        baseUrl: stripTrailingSlash(baseUrl),
        apiKey: process.env.TRANSCRIPTION_COMPAT_API_KEY || undefined,
        model,
    };
}

/** Emails granted the admin role after verified authentication. */
export function adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

export interface StorageConfig {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
    forcePathStyle: boolean;
    /** Browser-facing base URL for presigned playback links. */
    publicEndpoint?: string;
}

/** S3-compatible object storage config (MinIO, R2, AWS, ...). */
export function storageConfig(): StorageConfig {
    const missing = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'].filter(
        (name) => !process.env[name],
    );
    if (missing.length > 0) {
        throw new Error(`Missing storage env vars: ${missing.join(', ')}. See .env.example.`);
    }
    return {
        endpoint: serverEnv.R2_ENDPOINT,
        accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
        secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
        bucket: serverEnv.R2_BUCKET_NAME,
        region: process.env.S3_REGION || 'auto',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || undefined,
    };
}

/** MongoDB connection string. */
export function mongoUri(): string {
    const value = serverEnv.MONGODB_URI;
    if (!value) throw new Error('Missing MONGODB_URI environment variable. See .env.example.');
    return value;
}

/**
 * The single Gemini API key powering transcription, summaries,
 * transliteration, and embeddings. Undefined when unconfigured — AI callers
 * degrade gracefully, transcription throws an actionable error.
 */
export function geminiApiKey(): string | undefined {
    return serverEnv.GOOGLE_GENERATIVE_AI_API_KEY || undefined;
}

export type GeminiFeature = 'transcription' | 'summary' | 'transliteration' | 'embedding';

/** Resolve each Gemini feature's model at use time, including blank env values. */
export function geminiModel(feature: GeminiFeature): string {
    const name = `GEMINI_MODEL_${feature.toUpperCase()}`;
    return process.env[name]?.trim() || (feature === 'embedding' ? 'gemini-embedding-001' : 'gemini-3.8-flash');
}

/** Vector width is part of the model identity, never inferred from another model's vectors. */
export function searchEmbeddingDimensions(provider: AiProvider = aiProvider(), model?: string): number {
    const selectedModel = model ?? (provider === 'gemini' ? geminiModel('embedding') : compatTextConfig()?.embeddingModel);
    const raw = process.env.SEARCH_EMBEDDING_DIMENSIONS?.trim();
    if (!raw && provider === 'gemini' && selectedModel === 'gemini-embedding-001') return 3072;
    const value = raw ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value <= 0 || value > 65_536) {
        throw new Error('Set SEARCH_EMBEDDING_DIMENSIONS to the vector width of the configured embedding model.');
    }
    return value;
}

/** Configurable self-hosted quota multiplier. Managed policy uses its canonical weights. */
export function transcriptionMultiplier(provider: string): number {
    return transcriptionPricing()[provider] ?? 1;
}

/** Self-hosted multiplier defaults; managed provider policy does not use these overrides. */
export function transcriptionPricing(): Record<string, number> {
    const defaults: Record<string, number> = { soniox: 1, elevenlabs: 5, gemini: 0.5, openai_compat: 0.1 };
    const raw = process.env.TRANSCRIPTION_PRICING_JSON;
    if (!raw) return defaults;
    try {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            // Some env writers escape JSON quotes; dotenv retains those backslashes.
            // Only normalize after ordinary JSON parsing fails, preserving valid keys.
            if (!raw.includes('\\"')) throw error;
            parsed = JSON.parse(raw.replace(/\\"/g, '"'));
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('expected an object mapping providers to positive numbers');
        }
        const merged = { ...defaults };
        for (const [provider, multiplier] of Object.entries(parsed)) {
            if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0) {
                throw new Error(`multiplier for ${JSON.stringify(provider)} must be a positive number`);
            }
            merged[provider] = multiplier;
        }
        return merged;
    } catch (error) {
        throw new Error(
            `Invalid TRANSCRIPTION_PRICING_JSON: ${error instanceof Error ? error.message : error}`,
        );
    }
}


function numberSetting(name: string, fallback: number): number {
    const raw = process.env[name];
    const value = raw ? Number(raw) : fallback;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}: expected a positive number.`);
    return value;
}

function smtpPort(): number {
    const port = numberSetting('SMTP_PORT', 587);
    if (!Number.isInteger(port)) throw new Error('Invalid SMTP_PORT: expected a positive integer.');
    return port;
}

// Existing env imports delegate to these getters. Optional services remain lazy:
// reading the public origin never requires SMTP, object storage or Stripe keys.
export const serverEnv = {
    get S3_PUBLIC_ENDPOINT() { return process.env.S3_PUBLIC_ENDPOINT || ''; },
    get VERCEL_ENV() { return process.env.VERCEL_ENV || ''; },
    get NODE_ENV() { return publicEnv.NODE_ENV || 'development'; },
    get NEXT_PUBLIC_APP_URL() { return publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:9000'; },
    get NEXT_PUBLIC_MARKETING_URL() { return publicEnv.NEXT_PUBLIC_MARKETING_URL; },
    get MONGODB_URI() { return process.env.MONGODB_URI || ''; },
    get MONGODB_DNS_SERVERS() { return process.env.MONGODB_DNS_SERVERS; },
    get MONGODB_CONNECTION_MODE() { return (process.env.MONGODB_CONNECTION_MODE || 'default') as 'default' | 'fallback-first'; },
    get R2_ENDPOINT() { return process.env.R2_ENDPOINT || ''; },
    get R2_ACCESS_KEY_ID() { return process.env.R2_ACCESS_KEY_ID || ''; },
    get R2_SECRET_ACCESS_KEY() { return process.env.R2_SECRET_ACCESS_KEY || ''; },
    get R2_BUCKET_NAME() { return process.env.R2_BUCKET_NAME || ''; },
    get UPLOAD_SESSION_SECRET() { return process.env.UPLOAD_SESSION_SECRET || ''; },
    get SHARE_LINK_SECRET() { return process.env.SHARE_LINK_SECRET || ''; },
    get MOBILE_SYNC_SESSION_SECRET() { return process.env.MOBILE_SYNC_SESSION_SECRET || ''; },
    get GOOGLE_TOKEN_ENCRYPTION_KEY() { return process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || ''; },
    get NEXT_PUBLIC_GOOGLE_CLIENT_ID() { return publicEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID; },
    get GOOGLE_CLIENT_SECRET() { return process.env.GOOGLE_CLIENT_SECRET || ''; },
    get NEXT_PUBLIC_GOOGLE_REDIRECT_URI() { return publicEnv.NEXT_PUBLIC_GOOGLE_REDIRECT_URI; },
    get GOOGLE_GENERATIVE_AI_API_KEY() { return process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''; },
    get GEMINI_MODEL_TRANSCRIPTION() { return geminiModel('transcription'); },
    get GEMINI_MODEL_SUMMARY() { return geminiModel('summary'); },
    get GEMINI_MODEL_TRANSLITERATION() { return geminiModel('transliteration'); },
    get GEMINI_MODEL_EMBEDDING() { return geminiModel('embedding'); },
    get SONIOX_API_KEY() { return process.env.SONIOX_API_KEY || ''; },
    get SONIOX_API_BASE_URL() { return process.env.SONIOX_API_BASE_URL || 'https://api.soniox.com/v1'; },
    get SONIOX_MODEL_ID() { return process.env.SONIOX_MODEL_ID || 'stt-async-v4'; },
    get ELEVENLABS_API_KEY() { return process.env.ELEVENLABS_API_KEY || ''; },
    get ELEVENLABS_API_BASE_URL() { return process.env.ELEVENLABS_API_BASE_URL || 'https://api.elevenlabs.io/v1'; },
    get ELEVENLABS_MODEL_ID() { return process.env.ELEVENLABS_MODEL_ID || 'scribe_v2'; },
    get STRIPE_SECRET_KEY() { return process.env.STRIPE_SECRET_KEY || ''; },
    get STRIPE_WEBHOOK_SECRET() { return process.env.STRIPE_WEBHOOK_SECRET || ''; },
    get NEXT_PUBLIC_VAPID_PUBLIC_KEY() { return publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY; },
    get VAPID_PRIVATE_KEY() { return process.env.VAPID_PRIVATE_KEY || ''; },
    get VAPID_CONTACT_EMAIL() { return process.env.VAPID_CONTACT_EMAIL || ''; },
    get SMTP_PORT() { return smtpPort(); },
    get SMTP_SECURE() { return process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort() === 465; },
    get SMTP_HOST() { return process.env.SMTP_HOST || ''; },
    get SMTP_USER() { return process.env.SMTP_USER || ''; },
    get SMTP_PASS() { return process.env.SMTP_PASS || ''; },
    get EXPORT_JOB_STALE_MINUTES() { return numberSetting('EXPORT_JOB_STALE_MINUTES', 30); },
    get SOFT_DELETE_RESTORE_DAYS() { return numberSetting('SOFT_DELETE_RESTORE_DAYS', 30); },
    get SONIOX_WEBHOOK_SECRET() { return process.env.SONIOX_WEBHOOK_SECRET || ''; },
    get ELEVENLABS_WEBHOOK_SECRET() { return process.env.ELEVENLABS_WEBHOOK_SECRET || ''; },
    get SUPPORT_EMAIL() { return process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || ''; },
    get CRON_SECRET() { return process.env.CRON_SECRET || ''; },
    get GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION() { return process.env.GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION || 'v1'; },
    get NEXT_PUBLIC_ENABLE_BILLING() { return publicEnv.NEXT_PUBLIC_ENABLE_BILLING; },
    get NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU() { return publicEnv.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU; },
    get CSP_REPORT_ONLY() { return process.env.CSP_REPORT_ONLY === 'true'; },
};
