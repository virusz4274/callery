import { useMemo, useSyncExternalStore } from 'react';
import { adminProfile } from './admin-data';

let revision = 0;
function subscribe(listener: () => void) {
    window.addEventListener('popstate', listener); window.addEventListener('admin-fixture-route', listener);
    return () => { window.removeEventListener('popstate', listener); window.removeEventListener('admin-fixture-route', listener); };
}
function snapshot() { return `${revision}|${location.href}`; }
function navigate(href: string, replace = false, options?: { scroll?: boolean }) {
    history[replace ? 'replaceState' : 'pushState']({}, '', href);
    window.dispatchEvent(new Event('admin-fixture-route'));
    if (options?.scroll !== false) window.scrollTo(0, 0);
}
const router = {
    push: (href: string, options?: { scroll?: boolean }) => navigate(href, false, options),
    replace: (href: string, options?: { scroll?: boolean }) => navigate(href, true, options),
    refresh: () => { revision++; window.dispatchEvent(new Event('admin-fixture-route')); },
    back: () => history.back(), prefetch: async () => {},
};
export function useRouter() { return router; }
export function usePathname() { const value = useSyncExternalStore(subscribe, snapshot, () => ''); return useMemo(() => new URL(value.split('|')[1] || 'https://fixture.invalid/admin').pathname, [value]); }
export function useSearchParams() { const value = useSyncExternalStore(subscribe, snapshot, () => ''); return useMemo(() => new URL(value.split('|')[1] || 'https://fixture.invalid/admin').searchParams, [value]); }
export function useUser() { return { user: adminProfile, isUserLoading: false }; }
export function useUserProfile() { return { userProfile: adminProfile, isProfileLoading: false }; }
export function useAuthActions() { return {}; }
