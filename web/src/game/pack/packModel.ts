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

/** The line under a revealed pack; `title` replaces the pack value (trade gifts). */
export function summaryText (cards: CardData[], title?: string): string
{
    const { total, best } = summarizePack(cards);
    const best_ = `${best.name} (${RARITY_STYLE[best.rarity].label})`;
    if (title)
    {
        return cards.length === 1 ? `${title}\n${best_}` : `${title}\nBest: ${best_}`;
    }
    return `Pack value ${total} pts\nBest pull: ${best_}`;
}

/** Most cards the table deals at once. */
export const MAX_PACK_CARDS = 5;

/**
 * Where each of `count` cards sits, centred on (cx, cy): one row for up to 3,
 * 2 + 2 for 4, 3 on top and 2 below for 5 (a daily pack).
 */
export function packSlots (count: number, cx: number, cy: number, step: { x: number; y: number }): { x: number; y: number }[]
{
    const n = Math.max(0, Math.min(count, MAX_PACK_CARDS));
    const rows = n <= 3 ? [n] : n === 4 ? [2, 2] : [3, 2];
    const out: { x: number; y: number }[] = [];
    rows.forEach((inRow, r) =>
    {
        const y = cy + (r - (rows.length - 1) / 2) * step.y;
        for (let i = 0; i < inRow; i++)
        {
            out.push({ x: cx + (i - (inRow - 1) / 2) * step.x, y });
        }
    });
    return out;
}

export function revealHint (revealed: number, total: number): string
{
    return revealed === 0 ? 'Tap or swipe across the cards to reveal' : `${revealed} of ${total} revealed`;
}
