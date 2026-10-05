import { getSignedR2Url, getSignedStorageUrl } from '@/lib/r2';
import type { TranscriptionProvider } from '@/lib/config';

/** Cloud providers fetch a public URL; in-process downloads use internal storage. */
export function getTranscriptionAudioUrl(provider: TranscriptionProvider, key: string): Promise<string> {
    return provider === 'gemini' || provider === 'openai_compat'
        ? getSignedStorageUrl(key, 1800)
        : getSignedR2Url(key, 1800);
}
