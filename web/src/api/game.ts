// The game table's server calls: claim the daily pack, load the board, merge.
// The server decides every outcome; these only translate HTTP into what the
// Phaser scenes understand (bridge payloads, card data).

import { api } from './client';
import { toCardData, type OwnedCard } from './cards';
import type { BoardShowPayload, MergeFailure, MergeResultPayload } from '../bridge/events';
import { boardOrder, focusLayout, type BoardFocus } from '../game/merge/boardModel';

export type ClaimError = 'already_claimed' | 'no_season' | 'signed_out' | 'network';

export type ClaimOutcome =
    | { ok: true; cards: OwnedCard[]; nextResetAt: string }
    | { ok: false; error: ClaimError };

/** POST /packs/daily/claim: today's 5 cards in reveal order, or why not. */
export async function claimDailyPack (): Promise<ClaimOutcome>
{
    try
    {
        const { data, error, response } = await api.POST('/packs/daily/claim');
        if (data)
        {
            return { ok: true, cards: data.cards.map(c => toCardData(c)), nextResetAt: data.nextResetAt };
        }
        return { ok: false, error: claimError(response.status, error?.error) };
    }
    catch
    {
        return { ok: false, error: 'network' };
    }
}

export type GiftError = 'no_gifts' | 'sold_out' | 'no_season' | 'signed_out' | 'network';

/** Where an opened gift came from: a trade partner, or a tournament place it was won in. */
export type GiftFrom = { partner: string } | { tournament: string; place: number };

export type GiftOutcome =
    | { ok: true; cards: OwnedCard[]; from: GiftFrom[]; waiting: number }
    | { ok: false; error: GiftError };

/** POST /gifts/open: the waiting trade gifts and tournament prizes as cards, in reveal order. */
export async function openGifts (): Promise<GiftOutcome>
{
    try
    {
        const { data, error, response } = await api.POST('/gifts/open');
        if (data)
        {
            const from = data.gifts.map((g): GiftFrom => (g.tournament
                ? { tournament: g.tournament.name, place: g.tournament.place }
                : { partner: g.partner ?? '' }));
            return { ok: true, cards: data.gifts.map(g => toCardData(g.card)), from, waiting: data.giftsWaiting };
        }
        if (response.status === 401)
        {
            return { ok: false, error: 'signed_out' };
        }
        const code = error?.error;
        return { ok: false, error: code === 'no_gifts' || code === 'sold_out' || code === 'no_season' ? code : 'network' };
    }
    catch
    {
        return { ok: false, error: 'network' };
    }
}

export function claimError (status: number, code: string | undefined): ClaimError
{
    if (status === 401)
    {
        return 'signed_out';
    }
    if (status === 409 && code === 'already_claimed')
    {
        return 'already_claimed';
    }
    if (status === 503 && code === 'no_season')
    {
        return 'no_season';
    }
    return 'network';
}

/** GET /cards: the newest `size` cards for the merge board, plus how many the player owns. */
async function boardCards (query: { limit: number; spirit?: string; level?: number })
{
    const { data, error, response } = await api.GET('/cards', { params: { query } });
    if (!data)
    {
        throw new Error(`GET /cards: ${response.status} ${error?.error ?? ''}`.trim());
    }
    return { total: data.total, cards: data.cards.map(c => toCardData(c)) };
}

/**
 * The cards for the merge board, pairs that can level up first (`boardOrder`), or, with a focus
 * ("Merge" on a card), that card and its level-up matches first (`focusLayout`), then the rest.
 */
export async function loadBoard (size: number, focus: BoardFocus | null = null): Promise<BoardShowPayload>
{
    const [newest, matches] = await Promise.all([
        boardCards({ limit: size }),
        focus ? boardCards({ limit: size, spirit: focus.templateId, level: focus.level }) : null
    ]);
    const rest = boardOrder(newest.cards);
    const cards = focus && matches ? focusLayout(focus.id, matches.cards, rest, size) : rest;
    return {
        cards,
        total: newest.total,
        locked: cards.filter(c => c.inTrade || c.inTournament).map(c => c.id),
        inEvent: cards.filter(c => c.inTournament).map(c => c.id),
        focusId: focus && cards.some(c => c.id === focus.id) ? focus.id : undefined
    };
}

export interface MergeAnswer
{
    result: MergeResultPayload;
    /** HTTP status, 0 when the request never got an answer. */
    status: number;
}

/** POST /merges: drop cardIds[0] onto cardIds[1]. Never throws; failures come back as results. */
export async function mergeCards (requestId: string, cardIds: [string, string]): Promise<MergeAnswer>
{
    try
    {
        const { data, error, response } = await api.POST('/merges', { body: { cardIds } });
        if (data)
        {
            return {
                status: response.status,
                result: { requestId, ok: true, card: toCardData(data.card), kind: data.kind, discovered: data.discovered }
            };
        }
        return { status: response.status, result: { requestId, ok: false, error: mergeFailure(response.status, error?.error) } };
    }
    catch
    {
        return { status: 0, result: { requestId, ok: false, error: 'network' } };
    }
}

/** Server error → the failure the board animates. */
export function mergeFailure (status: number, code: string | undefined): MergeFailure
{
    switch (status)
    {
        case 404:
            return 'not_owned';
        case 409:
            return code === 'max_level' || code === 'sold_out' || code === 'in_trade' || code === 'in_tournament' ? code : 'no_recipe';
        case 400:
            // same_card: dropping a card on itself; the board treats it as no merge.
            return 'no_recipe';
        default:
            return 'network';
    }
}
