import { useSyncExternalStore } from 'react';
import { isUpdateReady, subscribeUpdate } from './serviceWorker';

function subscribeOnline (fn: () => void): () => void
{
    window.addEventListener('online', fn);
    window.addEventListener('offline', fn);
    return () =>
    {
        window.removeEventListener('online', fn);
        window.removeEventListener('offline', fn);
    };
}

/** False while the device has no network (the app shell still works from the cache). */
export function useOnline (): boolean
{
    return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/** True when a new version is installed and waiting for a reload. */
export function useAppUpdate (): boolean
{
    return useSyncExternalStore(subscribeUpdate, isUpdateReady);
}
