import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';

export interface OAuthConsentRequest {
    clientId: string;
    query: string;
    scopes: string[];
    resources: string[];
    claims: string[];
}

/** Only provider-signed, unexpired requests may be displayed for consent. */
export async function readOAuthConsentRequest(query: string, secret: string): Promise<OAuthConsentRequest | null> {
    if (!query || query.length > 16_384 || !await verifyOAuthQueryParams(query, secret)) return null;
    const params = new URLSearchParams(query);
    const clientId = params.get('client_id');
    if (!clientId || params.getAll('client_id').length !== 1 || params.getAll('scope').length > 1) return null;
    let claims: string[] = [];
    const rawClaims = params.get('claims');
    if (rawClaims) {
        try {
            const requested: unknown = JSON.parse(rawClaims);
            if (requested && typeof requested === 'object' && 'userinfo' in requested && requested.userinfo && typeof requested.userinfo === 'object' && !Array.isArray(requested.userinfo)) claims = Object.keys(requested.userinfo);
        } catch { return null; }
    }
    return { clientId, query, scopes: [...new Set((params.get('scope') || '').split(/\s+/).filter(Boolean))], resources: params.getAll('resource'), claims };
}

export function oauthPageQuery(values: Record<string, string | string[] | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (Array.isArray(value)) value.forEach(item => query.append(key, item));
        else if (value !== undefined) query.append(key, value);
    }
    return query.toString();
}

