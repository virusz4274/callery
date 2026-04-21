'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { initializeFirebase } from '@/lib/firebase/client';

export function HomepageRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams.toString();
    const hasLegacyRecordingLink = Boolean(searchParams.get('id'));

    if (hasLegacyRecordingLink) {
      router.replace(search ? `/recordings?${search}` : '/recordings');
      return;
    }

    const { auth } = initializeFirebase();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        return;
      }

      router.replace(search ? `/recordings?${search}` : '/recordings');
    });

    return () => unsubscribe();
  }, [router, searchParams]);

  return null;
}
