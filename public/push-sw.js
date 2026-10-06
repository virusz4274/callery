// Custom Service Worker for handling Push Notifications
// Imported by the Serwist service worker.

self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push Received.');
    if (!event.data) return;

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        console.warn('[Service Worker] Push data is not JSON, using text as body.');
        data = { body: event.data.text() };
    }

    const title = data.title || 'Callery';
    const options = {
        body: data.body || 'New notification',
        icon: data.icon || '/icons/callery/android-chrome-192x192.png',
        badge: '/icons/callery/android-chrome-192x192.png',
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

    const target = new URL(event.notification.data?.url || '/', self.location.origin);
    const url = target.origin === self.location.origin ? target.href : self.location.origin;

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
