// Explicit property accesses let Next inline public settings in the browser.
// Optional integrations do not require credentials until enabled.
export const publicEnv = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    NEXT_PUBLIC_ENABLE_BILLING: process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true',
    NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU: process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU !== 'false',
};
