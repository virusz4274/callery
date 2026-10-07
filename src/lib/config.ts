// Single validated view over environment configuration.
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
    const host = process.env.SMTP_HOST;
    if (!host) {
        throw new Error('Missing SMTP_HOST environment variable (EMAIL_PROVIDER=smtp). See .env.example.');
    }
    const rawPort = process.env.SMTP_PORT;
    const port = rawPort ? Number(rawPort) : 587;
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`Invalid SMTP_PORT=${JSON.stringify(rawPort)}. Expected a positive integer.`);
    }
    return {
        host,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        user: process.env.SMTP_USER || undefined,
        pass: process.env.SMTP_PASS || undefined,
    };
}

/**
 * Whether Stripe billing is active. Default OFF: self-hosted instances run
 * without billing unless the operator opts in. Managed SaaS sets
 * NEXT_PUBLIC_ENABLE_BILLING=true.
 */
export function billingEnabled(): boolean {
    return process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true';
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
        endpoint: process.env.R2_ENDPOINT as string,
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
        bucket: process.env.R2_BUCKET_NAME as string,
        region: process.env.S3_REGION || 'auto',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || undefined,
    };
}

/** MongoDB connection string. */
export function mongoUri(): string {
    return required('MONGODB_URI');
}

/**
 * The single Gemini API key powering transcription, summaries,
 * transliteration, and embeddings. Undefined when unconfigured — AI callers
 * degrade gracefully, transcription throws an actionable error.
 */
export function geminiApiKey(): string | undefined {
    return process.env.GOOGLE_GENERATIVE_AI_API_KEY || undefined;
}

export type GeminiFeature = 'transcription' | 'summary' | 'transliteration' | 'embedding';

/** Resolve each Gemini feature's model at use time, including blank env values. */
export function geminiModel(feature: GeminiFeature): string {
    const name = `GEMINI_MODEL_${feature.toUpperCase()}`;
    return process.env[name]?.trim() || (feature === 'embedding' ? 'gemini-embedding-001' : 'gemini-3.8-flash');
}

/** Billed-unit multiplier for one provider (managed metering). Unknown providers bill at 1x. */
export function transcriptionMultiplier(provider: string): number {
    return transcriptionPricing()[provider] ?? 1;
}

/** Billed-unit multipliers per transcription provider (managed metering). */
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
