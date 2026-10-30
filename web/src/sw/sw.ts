// Folk Gacha service worker: the offline app shell.
// - Precaches the built app (HTML, JS, CSS, icons, Phaser); the list is filled in at build time.
// - Every page navigation gets the cached index.html, so the installed app opens offline.
// - /api/* is never cached: the server decides every outcome, so game data is always live.
// - A new version waits until the page says so (the "New version available" banner).
// - Push: shows "your pack is ready" (sent by the server's daily job) and opens the app on tap.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

/** What the server sends (server/internal/push Message). */
interface PushMessage
{
    title: string;
    body: string;
    url: string;
    tag: string;
}

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('message', event =>
{
    if (event.data?.type === 'SKIP_WAITING')
    {
        void self.skipWaiting();
    }
});

self.addEventListener('push', event =>
{
    let msg: PushMessage = { title: 'Folk Gacha', body: 'Your daily pack is ready.', url: '/', tag: 'daily-pack' };
    try
    {
        msg = { ...msg, ...(event.data?.json() as Partial<PushMessage>) };
    }
    catch
    {
        // Not JSON: show the default text.
    }
    event.waitUntil(self.registration.showNotification(msg.title, {
        body: msg.body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        // Same tag replaces yesterday's unread notification instead of stacking.
        tag: msg.tag,
        data: { url: msg.url }
    }));
});

self.addEventListener('notificationclick', event =>
{
    event.notification.close();
    const url = new URL((event.notification.data as { url?: string } | null)?.url ?? '/', self.location.origin).href;
    event.waitUntil((async () =>
    {
        // Bring an open Folk Gacha window to the front; otherwise open one.
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = windows.find(w => new URL(w.url).origin === self.location.origin);
        if (open)
        {
            await open.focus();
            return;
        }
        await self.clients.openWindow(url);
    })());
});
