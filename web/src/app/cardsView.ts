// The Cards tab has two views of the same cards: the merge Board (Phaser) and the List
// (the React collection). Pure helpers, so the tab rules are testable without React.

import type { Tab } from './useTabs';

/** The buttons on the tab bar. "Cards" opens whichever view the player used last. */
export type NavTab = 'PackOpen' | 'Cards' | 'Trades' | 'Tournaments' | 'Leaderboard';
export type CardsView = 'MergeBoard' | 'Collection';

/** The tab bar button that is lit for a screen. */
export function navOf (tab: Tab): NavTab
{
    return tab === 'MergeBoard' || tab === 'Collection' ? 'Cards' : tab;
}

export const CARDS_VIEW_KEY = 'fg.cardsView';

/** The remembered view; new players start on the Board (the tutorial merges there). */
export function readCardsView (storage: Pick<Storage, 'getItem'> | null): CardsView
{
    try
    {
        return storage?.getItem(CARDS_VIEW_KEY) === 'Collection' ? 'Collection' : 'MergeBoard';
    }
    catch
    {
        return 'MergeBoard';
    }
}

export function saveCardsView (storage: Pick<Storage, 'setItem'> | null, view: CardsView): void
{
    try
    {
        storage?.setItem(CARDS_VIEW_KEY, view);
    }
    catch
    {
        // Private mode or blocked storage: the choice just isn't remembered.
    }
}

/** localStorage, or null where touching it throws. */
export function browserStorage (): Storage | null
{
    try
    {
        return window.localStorage;
    }
    catch
    {
        return null;
    }
}
