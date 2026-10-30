import { useEffect, useState } from 'react';
import type { CardData } from '../game/cards/model';

/** Dev only: ?showcase deals local packs with one card of every rarity, for tuning the reveal effects. */
export const SHOWCASE = new URLSearchParams(location.search).has('showcase');

/**
 * A function that deals a showcase pack, once the Season 1 catalog has loaded; null
 * before that and whenever ?showcase is off. Loaded on demand so the client-side
 * rolls never ship in the normal game.
 */
export function useShowcase (): (() => CardData[]) | null
{
    const [deal, setDeal] = useState<(() => CardData[]) | null>(null);
    useEffect(() =>
    {
        if (!SHOWCASE)
        {
            return;
        }
        let cancelled = false;
        void Promise.all([import('./fakePack'), import('./seasonCatalog')]).then(async ([fake, catalog]) =>
        {
            const source = await catalog.loadSeasonCatalog().then(fake.seasonSource, () => fake.templateSource);
            if (!cancelled)
            {
                setDeal(() => () => source.showcase());
            }
        });
        return () =>
        {
            cancelled = true;
        };
    }, []);
    return deal;
}
