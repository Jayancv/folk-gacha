import { useSyncExternalStore } from 'react';

// Whether the live socket is open, for screens that poll only without it.
let connected = false;
const listeners = new Set<() => void>();

export function setLiveConnected (value: boolean): void
{
    if (value !== connected)
    {
        connected = value;
        listeners.forEach(l => l());
    }
}

export function useLiveConnected (): boolean
{
    return useSyncExternalStore(
        l =>
        {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => connected
    );
}
