'use client';

const PRIVATE_PWA_CACHES = ['apis', 'start-url'];

export async function clearPrivatePwaCaches(): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) {
        return;
    }

    const cacheNames = await caches.keys();

    await Promise.all(
        cacheNames
            .filter((cacheName) => PRIVATE_PWA_CACHES.includes(cacheName))
            .map((cacheName) => caches.delete(cacheName))
    );
}
