// Pure pack-opening text and summary logic (no Phaser), shared by PackOpen and tests.

import { RARITY_STYLE, rarityRank, type CardData } from '../cards/model';

export interface PackSummary
{
    total: number;
    best: CardData;
}

/** Total score and best pull: highest rarity, then highest score, first one wins ties. */
export function summarizePack (cards: CardData[]): PackSummary
{
    if (cards.length === 0)
    {
        throw new Error('summarizePack needs at least one card');
    }
    const total = cards.reduce((sum, c) => sum + c.score, 0);
    const best = cards.reduce((a, c) =>
        rarityRank(c.rarity) > rarityRank(a.rarity) || (c.rarity === a.rarity && c.score > a.score) ? c : a);
    return { total, best };
}

export function summaryText (cards: CardData[]): string
{
    const { total, best } = summarizePack(cards);
    return `Pack value ${total} pts\nBest pull: ${best.name} (${RARITY_STYLE[best.rarity].label})`;
}

export function revealHint (revealed: number, total: number): string
{
    return revealed === 0 ? 'Tap or swipe across the cards to reveal' : `${revealed} of ${total} revealed`;
}
