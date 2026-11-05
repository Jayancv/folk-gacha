// The "Merge" button on a card's sheet: whether it can be used and what to say under it.
// Pure, so it's testable; the server still decides every merge.

import { MAX_LEVEL } from '../../game/cards/model';
import type { OwnedCard } from '../../api/cards';

export interface MergeAction
{
    enabled: boolean;
    label: string;
    hint: string;
}

type MergeCard = Pick<OwnedCard, 'name' | 'level' | 'inTrade' | 'inTournament' | 'season'>;

const spirit = (card: MergeCard): string => card.season?.title ?? card.name;

type PairCard = Pick<OwnedCard, 'id' | 'templateId' | 'level' | 'inTrade' | 'inTournament'>;

/**
 * Cards in the list that can level up with another card in it (same spirit and level, below
 * max, neither locked), with the size of their group. Counts only the loaded cards, so a
 * partner on a later page can be missed, but a marked card always has one.
 */
export function pairGroups (cards: readonly PairCard[]): Map<string, number>
{
    const key = (c: PairCard) => `${c.templateId}:${c.level}`;
    const free = cards.filter(c => c.level < MAX_LEVEL && !c.inTrade && !c.inTournament);
    const sizes = new Map<string, number>();
    for (const c of free)
    {
        sizes.set(key(c), (sizes.get(key(c)) ?? 0) + 1);
    }
    const out = new Map<string, number>();
    for (const c of free)
    {
        const n = sizes.get(key(c)) ?? 0;
        if (n >= 2)
        {
            out.set(c.id, n);
        }
    }
    return out;
}

/**
 * `matches`: your other cards of the same spirit and level (level-up partners), or
 * undefined while it loads. Recipes are never hinted, so a card without a match can
 * still go to the Board.
 */
export function mergeAction (card: MergeCard, matches: number | undefined): MergeAction
{
    if (card.inTrade)
    {
        return { enabled: false, label: 'Merge', hint: 'Offered in an open trade. Withdraw the offer on Trades to merge it.' };
    }
    if (card.inTournament)
    {
        return { enabled: false, label: 'Merge', hint: 'In a tournament lineup: it can merge again when the tournament ends.' };
    }
    if (card.level >= MAX_LEVEL)
    {
        return { enabled: true, label: 'Merge', hint: 'Max level. Only a recipe with a different spirit can still use it.' };
    }
    if (matches === undefined)
    {
        return { enabled: true, label: 'Merge', hint: '' };
    }
    if (matches === 0)
    {
        return {
            enabled: true,
            label: 'Merge',
            hint: `No other level ${card.level} ${spirit(card)} yet. Some different spirits combine into new ones.`
        };
    }
    return {
        enabled: true,
        label: `Merge · ${matches} ${matches === 1 ? 'match' : 'matches'}`,
        hint: `Level it up with ${matches === 1 ? 'your other' : `one of your ${matches} other`} level ${card.level} ${spirit(card)}.`
    };
}
