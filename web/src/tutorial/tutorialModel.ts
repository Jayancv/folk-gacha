// The first-time tutorial as a small state machine (no React here, so it's testable).
// Each step waits for the player to actually do the thing; the game is never blocked.

import type { CardData } from '../game/cards/model';
import { isLevelUpMatch } from '../game/merge/boardModel';

export type TutorialStep =
    | 'open-pack' // tap "Open today's pack"
    | 'flip' // reveal the five cards
    | 'go-board' // open the Board tab
    | 'merge' // drag a card onto its pair
    | 'no-pair' // no pair yet: explain, then finish
    | 'done'; // wrap-up, then finish

export type TutorialEvent =
    | 'claimed' // today's pack was opened
    | 'revealed' // every card of the pack is face up
    | 'board-with-pair' // the board loaded and has a level-up pair
    | 'board-without-pair' // the board loaded with no pair
    | 'merged' // a merge succeeded
    | 'next'; // the bubble's button

export const STEP_ORDER: TutorialStep[] = ['open-pack', 'flip', 'go-board', 'merge', 'done'];

/** Where to start: someone who already opened today's pack begins at the Board. */
export function firstStep (packReady: boolean): TutorialStep
{
    return packReady ? 'open-pack' : 'go-board';
}

const TRANSITIONS: Partial<Record<TutorialStep, Partial<Record<TutorialEvent, TutorialStep>>>> = {
    'open-pack': { claimed: 'flip' },
    flip: { revealed: 'go-board' },
    'go-board': { 'board-with-pair': 'merge', 'board-without-pair': 'no-pair' },
    merge: { merged: 'done' },
    'no-pair': { next: 'done' }
};

/** The next step; events that don't apply to the current step change nothing. */
export function advance (step: TutorialStep, event: TutorialEvent): TutorialStep
{
    return TRANSITIONS[step]?.[event] ?? step;
}

/** Pressing the bubble's button on this step finishes the tutorial. */
export const finishesOnNext = (step: TutorialStep): boolean => step === 'done';

/** The first card that has a level-up partner on the board (same spirit and level), or null. */
export function findPair (cards: readonly CardData[]): CardData | null
{
    return cards.find(a => cards.some(b => isLevelUpMatch(a, b))) ?? null;
}

/** The plain spirit name ("Gaja Calf"), not the card's full trait name. */
export function spiritName (card: CardData): string
{
    return card.season?.title ?? card.name;
}

/** What a highlighted control is called in the UI (data-tutorial="..."). */
export type TutorialTarget = 'claim' | 'tab-MergeBoard';

export interface StepContent
{
    title: string;
    body: string;
    /** The control to spotlight; none for steps on the Phaser table. */
    target?: TutorialTarget;
    /** A button on the bubble; steps without one advance when the player acts. */
    button?: string;
}

export function stepContent (step: TutorialStep, pair: CardData | null): StepContent
{
    switch (step)
    {
        case 'open-pack':
            return { title: 'Your daily pack', body: 'Every day you get a free pack of 5 spirit cards. Tap to open it!', target: 'claim' };
        case 'flip':
            return { title: 'Reveal your cards', body: 'Tap a card, or swipe across them, to flip. Rarer cards put on a bigger show!' };
        case 'go-board':
            return { title: 'Time to merge', body: 'Merging makes your cards stronger. Open the Board.', target: 'tab-MergeBoard' };
        case 'merge':
            return {
                title: 'Merge a pair',
                body: pair
                    ? `Drag one ${spiritName(pair)} onto the other to level it up. Some different spirits combine into new ones too!`
                    : 'Drag a card onto a matching one (same spirit and level) to level it up.'
            };
        case 'no-pair':
            return {
                title: 'No pair yet',
                body: 'Two cards of the same spirit and level merge into a stronger one. You don\'t have a pair yet: come back tomorrow for another pack!',
                button: 'Got it'
            };
        case 'done':
            return {
                title: "You're all set!",
                body: 'Check Cards for your collection and Ranks for this week\'s leaderboard. A new pack arrives every day at 00:00 UTC.',
                button: 'Start playing'
            };
    }
}

/** Progress dots: which of the main steps this is (the no-pair detour counts as the merge step). */
export function stepNumber (step: TutorialStep): number
{
    return STEP_ORDER.indexOf(step === 'no-pair' ? 'merge' : step) + 1;
}
