export const ADMIN_USERS_RETURN_KEY = 'vosift:admin-users-return';
export function safeUsersReturnHref(value: unknown): string {
    if (typeof value !== 'string' || !value.startsWith('/admin/users') || value.startsWith('//')) return '/admin/users';
    try {
        const url = new URL(value, 'https://admin.invalid');
        return url.origin === 'https://admin.invalid' && url.pathname === '/admin/users' ? url.pathname + url.search : '/admin/users';
    } catch { return '/admin/users'; }
}

export function rememberUsersPosition() {
    try { sessionStorage.setItem(ADMIN_USERS_RETURN_KEY, JSON.stringify({ href: location.pathname + location.search, scroll: window.scrollY })); } catch { /* Storage can be unavailable. */ }
}

export function usersReturnContext(): { href: string; scroll: number } {
    try {
        const value = JSON.parse(sessionStorage.getItem(ADMIN_USERS_RETURN_KEY) || 'null');
        const href = safeUsersReturnHref(value?.href);
        return { href, scroll: href === value?.href && Number.isFinite(value?.scroll) ? Math.max(0, value.scroll) : 0 };
    } catch { return { href: '/admin/users', scroll: 0 }; }
}
