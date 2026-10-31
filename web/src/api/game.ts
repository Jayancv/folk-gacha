// The game table's server calls: claim the daily pack, load the board, merge.
// The server decides every outcome; these only translate HTTP into what the
// Phaser scenes understand (bridge payloads, card data).

import { api } from './client';
import { toCardData, type OwnedCard } from './cards';
import type { BoardShowPayload, MergeFailure, MergeResultPayload } from '../bridge/events';

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

export type GiftOutcome =
    | { ok: true; cards: OwnedCard[]; partners: string[]; waiting: number }
    | { ok: false; error: GiftError };

/** POST /gifts/open: the waiting trade gifts as cards, in reveal order (with whom each trade was). */
export async function openGifts (): Promise<GiftOutcome>
{
    try
    {
        const { data, error, response } = await api.POST('/gifts/open');
        if (data)
        {
            return { ok: true, cards: data.gifts.map(g => toCardData(g.card)), partners: data.gifts.map(g => g.partner), waiting: data.giftsWaiting };
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
export async function loadBoard (size: number): Promise<BoardShowPayload>
{
    const { data, error, response } = await api.GET('/cards', { params: { query: { limit: size } } });
    if (!data)
    {
        throw new Error(`GET /cards: ${response.status} ${error?.error ?? ''}`.trim());
    }
    return { cards: data.cards.map(c => toCardData(c)), total: data.total };
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
            return code === 'max_level' || code === 'sold_out' || code === 'in_trade' ? code : 'no_recipe';
        case 400:
            // same_card: dropping a card on itself; the board treats it as no merge.
            return 'no_recipe';
        default:
            return 'network';
    }
}
