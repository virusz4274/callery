import { redirect } from 'next/navigation';
import { getAuthSecret } from '@/lib/auth/config';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';
import { oauthPageQuery, readOAuthConsentRequest } from '@/lib/oauth-consent';
import { OAuthSignInAgain } from '@/components/oauth/sign-in-again';

export const metadata = { title: 'Sign in to connect | Callery', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function OAuthLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const query = oauthPageQuery(await searchParams);
    if (!await readOAuthConsentRequest(query, getAuthSecret())) return <div className="mx-auto max-w-xl space-y-3 py-12"><h1 className="text-2xl font-semibold">Connection request expired</h1><p className="text-muted">Return to the app and start the Callery connection again.</p></div>;
    const loginUrl = buildLoginRedirectHref(`/oauth/consent?${query}`);
    if (!await getAuthSubjectFromSession()) redirect(loginUrl);
    return <OAuthSignInAgain loginUrl={loginUrl} />;
}
