// Registers the service worker (src/sw/sw.ts) and tracks whether a new version is
// waiting. Started from main.tsx; React reads it through useAppUpdate. In dev the
// worker is off and registerSW does nothing.
import { registerSW } from 'virtual:pwa-register';

/** Look for a new deploy this often while the app stays open (installed apps can run for days). */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

let updateReady = false;
let applyUpdate: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

export function startServiceWorker (): void
{
    if (!('serviceWorker' in navigator))
    {
        return;
    }
    const update = registerSW({
        immediate: true,
        // A new version is installed and waiting: offer it, never reload mid-game on our own.
        onNeedRefresh ()
        {
            updateReady = true;
            listeners.forEach(fn => fn());
        },
        onRegisteredSW (_url, registration)
        {
            if (registration)
            {
                setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_MS);
            }
        }
    });
    applyUpdate = () => update(true); // activate the waiting worker, then reload
}

export const isUpdateReady = (): boolean => updateReady;

export function subscribeUpdate (fn: () => void): () => void
{
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function reloadIntoUpdate (): void
{
    void applyUpdate?.();
}
