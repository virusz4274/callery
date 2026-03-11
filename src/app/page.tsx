import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/pages/landing-page';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export default async function Home() {
    const firebaseUid = await getFirebaseUidFromSession();

    if (firebaseUid) {
        redirect('/recordings');
    }

    return <LandingPage />;
}
