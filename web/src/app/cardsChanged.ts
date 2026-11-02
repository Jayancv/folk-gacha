import { useSyncExternalStore } from 'react';

// Bumped when the player's cards changed outside the table they're looking at (a trade,
// a live trade event, opened gifts), so the Board knows to reload. The collection
// refreshes through TanStack Query; the Board lays out its own copy, so it needs this.
let version = 0;
const listeners = new Set<() => void>();

export function cardsChanged (): void
{
    version++;
    listeners.forEach(l => l());
}

export function useCardsVersion (): number
{
    return useSyncExternalStore(
        l =>
        {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => version
    );
}
