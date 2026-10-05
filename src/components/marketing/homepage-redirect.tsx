'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/lib/auth/client';

export function HomepageRedirect() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isUserLoading } = useUser();
    useEffect(() => {
        if (isUserLoading || (!user && !searchParams.get('id'))) return;
        const search = searchParams.toString();
        router.replace(search ? `/recordings?${search}` : '/recordings');
    }, [router, searchParams, user, isUserLoading]);
    return null;
}
