// Folk Gacha service worker: the offline app shell.
// - Precaches the built app (HTML, JS, CSS, icons, Phaser); the list is filled in at build time.
// - Every page navigation gets the cached index.html, so the installed app opens offline.
// - /api/* is never cached: the server decides every outcome, so game data is always live.
// - A new version waits until the page says so (the "New version available" banner).
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

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
