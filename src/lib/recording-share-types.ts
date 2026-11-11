export interface ShareLinkResponse {
    id: string;
    url: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
    status: 'active' | 'expired' | 'revoked';
}
