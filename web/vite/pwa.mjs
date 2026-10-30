import { VitePWA } from 'vite-plugin-pwa';

// The service worker (src/sw/sw.ts) caches the app shell so the installed app opens
// without a network. Our own worker (injectManifest), because push notifications
// ("your pack is ready") will be handled there too. The manifest stays the static
// public/manifest.webmanifest. Off in dev, so nothing stale gets cached while coding.
export const pwa = () => VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src/sw',
    filename: 'sw.ts',
    manifest: false,
    injectRegister: false, // src/app/pwa/serviceWorker.ts registers it
    injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,webp,ico,svg,webmanifest,woff2}'],
        // The 1 MB season catalog is only for the dev ?showcase page.
        globIgnores: ['**/cards-*.json'],
        // Phaser's chunk is ~1.4 MB; it's the main thing worth caching.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
    },
    devOptions: { enabled: false }
});
