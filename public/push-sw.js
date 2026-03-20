// Custom Service Worker for handling Push Notifications
// This file will be injected into the next-pwa generated service worker

const LEGACY_RUNTIME_CACHES = ['apis', 'start-url'];

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((cacheName) => LEGACY_RUNTIME_CACHES.includes(cacheName))
                    .map((cacheName) => caches.delete(cacheName))
            )
        )
    );
});

self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push Received.');
    console.log(`[Service Worker] Push had this data: "${event.data.text()}"`);

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        console.warn('[Service Worker] Push data is not JSON, using text as body.');
        data = { body: event.data.text() };
    }

    const title = data.title || 'Callery';
    const options = {
        body: data.body || data.message || 'New notification',
        icon: data.icon || '/icons/android-chrome-192x192.png',
        badge: '/icons/android-chrome-192x192.png',
        tag: data.tag || 'callery-notification',
        data: {
            url: data.url || '/',
        },
        vibrate: [200, 100, 200],
        requireInteraction: true, // Keep notification until user interacts
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.');
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus on existing window if available
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus().then(() => client.navigate(url));
                }
            }
            // Open new window if no existing window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
