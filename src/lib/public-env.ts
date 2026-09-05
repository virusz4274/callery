import { z } from 'zod';
import { logger } from '@/lib/logger';

const requiredBooleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const publicEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
    NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().min(1),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
    NEXT_PUBLIC_ENABLE_BILLING: requiredBooleanString,
    NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU: requiredBooleanString,
});

const parsed = publicEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_ENABLE_BILLING: process.env.NEXT_PUBLIC_ENABLE_BILLING,
    NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU: process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU,
});

if (!parsed.success) {
    logger.error('Invalid public environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid public environment variables');
}

export const publicEnv = parsed.data;
