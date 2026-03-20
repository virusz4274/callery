import { publicEnv } from '../public-env';

/**
 * Firebase Client Configuration using environment variables.
 */
export const firebaseConfig = {
    apiKey: publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: publicEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
};
