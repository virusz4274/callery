import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { getAuthSecret } from '@/lib/auth/config';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';
import { oauthPageQuery, readOAuthConsentRequest } from '@/lib/oauth-consent';
import { OAuthConsentForm } from '@/components/oauth/consent-form';

export const metadata = { title: 'Connect an app | Callery', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function OAuthConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const query = oauthPageQuery(await searchParams);
    const request = await readOAuthConsentRequest(query, getAuthSecret());
    if (!request) return <RequestUnavailable />;
    const owner = await getAuthSubjectFromSession();
    if (!owner) redirect(buildLoginRedirectHref(`/oauth/consent?${query}`));
    const requestHeaders = await headers();
    let client: { client_name?: string; client_uri?: string };
    let account: string | undefined;
    try {
        const auth = await getAuth();
        client = await auth.api.getOAuthClientPublic({ headers: requestHeaders, query: { client_id: request.clientId } });
        const session = await auth.api.getSession({ headers: requestHeaders });
        account = session?.user.email;
    } catch { return <RequestUnavailable />; }
    if (!account) redirect(buildLoginRedirectHref(`/oauth/consent?${query}`));
    return <OAuthConsentForm query={request.query} clientName={client.client_name || 'This app'} clientUri={client.client_uri} account={account} scopes={request.scopes} claims={request.claims} />;
}

function RequestUnavailable() {
    return <div className="mx-auto max-w-xl space-y-3 py-12"><h1 className="text-2xl font-semibold">Connection request unavailable</h1><p className="text-muted">This request is invalid, expired, or the app is no longer available. Return to the app and start the Callery connection again.</p></div>;
}
