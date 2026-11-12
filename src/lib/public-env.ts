// Explicit public property accesses let Next and vinext inline browser-safe settings.
// Keep this module independent of server configuration and its secret variables.
export const publicEnv = {
    get NEXT_PUBLIC_APP_URL() { return process.env.NEXT_PUBLIC_APP_URL || ''; },
    get NEXT_PUBLIC_MARKETING_URL() { return process.env.NEXT_PUBLIC_MARKETING_URL || ''; },
    get NODE_ENV() { return process.env.NODE_ENV; },
    get NEXT_PUBLIC_VAPID_PUBLIC_KEY() { return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''; },
    get NEXT_PUBLIC_GOOGLE_CLIENT_ID() { return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''; },
    get NEXT_PUBLIC_GOOGLE_REDIRECT_URI() { return process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || ''; },
    get NEXT_PUBLIC_ENABLE_BILLING() { return process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true'; },
    get NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU() { return process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU !== 'false'; },
};
