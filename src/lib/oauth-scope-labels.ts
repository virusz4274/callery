/** Browser-safe labels shared by consent and connected-app settings. */
export function oauthScopeLabel(scope: string): string {
    const labels: Record<string, string> = {
        'recordings:read': 'Read your recordings, summaries, and transcripts',
        'recordings:upload': 'Upload recordings to your account',
        'recordings:download': 'Play and download recording audio',
        'recordings:transcribe': 'Request transcription and processing',
        offline_access: 'Stay connected until you revoke access or authorization expires',
        openid: 'Identify your Callery account',
        profile: 'Read your name and profile picture',
        email: 'Read your email address',
    };
    return labels[scope] ?? scope;
}
