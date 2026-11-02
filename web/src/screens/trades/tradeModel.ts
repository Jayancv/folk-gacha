// Trade screens without React: who gives what from your side, grouping, and text.
// The server decides every trade; this only arranges what it sends.

import { toCardData, type OwnedCard } from '../../api/cards';
import type { components } from '../../api/schema';
import { SEASON_CONFIGS, type SeasonArtConfig } from '../../game/cards/seasonArt';

export type ApiTrade = components['schemas']['Trade'];
export type TradeStatus = ApiTrade['status'];

/** How often the inbox refreshes while the live socket is down. */
export const TRADES_POLL_MS = 30_000;

/** One card of an offer. `card` is missing once the card no longer exists (merged away). */
export interface TradeCard
{
    cardId: string;
    card?: OwnedCard;
}

/** An offer seen from your side. */
export interface TradeView
{
    id: string;
    incoming: boolean;
    /** The other player's username. */
    partner: string;
    status: TradeStatus;
    createdAt: string;
    expiresAt: string;
    resolvedAt?: string;
    youGive: TradeCard[];
    youGet: TradeCard[];
    /** This trade gave you a partner gift (it waits on the Pack tab). */
    gifted: boolean;
}

export function toTradeView (t: ApiTrade, configs: Record<string, SeasonArtConfig> = SEASON_CONFIGS): TradeView
{
    const side = (items: ApiTrade['offer']): TradeCard[] =>
        items.map(i => (i.card ? { cardId: i.cardId, card: toCardData(i.card, configs) } : { cardId: i.cardId }));
    const incoming = t.direction === 'incoming';
    // The sender gives `offer` and asks for `request`.
    const offer = side(t.offer);
    const request = side(t.request);
    return {
        id: t.id,
        incoming,
        partner: incoming ? t.from : t.to,
        status: t.status,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        resolvedAt: t.resolvedAt,
        youGive: incoming ? request : offer,
        youGet: incoming ? offer : request,
        gifted: t.gifted
    };
}

/** The inbox: offers waiting for you, offers you sent, and resolved ones (in the server's order, newest first). */
export function groupTrades (trades: readonly TradeView[]): { incoming: TradeView[]; sent: TradeView[]; history: TradeView[] }
{
    return {
        incoming: trades.filter(t => t.status === 'open' && t.incoming),
        sent: trades.filter(t => t.status === 'open' && !t.incoming),
        history: trades.filter(t => t.status !== 'open')
    };
}

/** Offers waiting for your answer (the tab badge). */
export function waitingCount (trades: readonly TradeView[]): number
{
    return trades.filter(t => t.status === 'open' && t.incoming).length;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "Expires in 2 d" / "in 5 h" / "in 12 min". */
export function expiresText (expiresAt: string, now = Date.now()): string
{
    const left = Date.parse(expiresAt) - now;
    if (left < MINUTE)
    {
        return 'Expiring now';
    }
    if (left < HOUR)
    {
        return `Expires in ${Math.floor(left / MINUTE)} min`;
    }
    if (left < 24 * HOUR)
    {
        return `Expires in ${Math.floor(left / HOUR)} h`;
    }
    return `Expires in ${Math.floor(left / (24 * HOUR))} d`;
}

/** What happened to a resolved offer, from your side. */
export function statusText (t: Pick<TradeView, 'status' | 'incoming' | 'partner'>): string
{
    switch (t.status)
    {
        case 'open':
            return t.incoming ? `Offer from ${t.partner}` : `Waiting for ${t.partner}`;
        case 'accepted':
            return `Traded with ${t.partner}`;
        case 'declined':
            return t.incoming ? `You declined ${t.partner}'s offer` : `${t.partner} declined`;
        case 'cancelled':
            return t.incoming ? `${t.partner} withdrew the offer` : 'You withdrew the offer';
        case 'expired':
            return 'Expired';
        case 'failed':
            return 'Failed: a card was no longer available';
    }
}

/** "today" / "yesterday" / "3 days ago" (UTC days, like the rest of the game). */
export function whenText (at: string, now = Date.now()): string
{
    const day = (t: number) => Math.floor(t / (24 * HOUR));
    const days = day(now) - day(Date.parse(at));
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * A resolved offer as one line, without its cards (they may have been merged or
 * traded on since): "Traded with asha · 2 for 1 · gift · yesterday".
 */
export function historyText (t: Pick<TradeView, 'status' | 'incoming' | 'partner' | 'youGive' | 'youGet' | 'gifted' | 'resolvedAt' | 'createdAt'>, now = Date.now()): string
{
    const parts = [statusText(t)];
    if (t.status === 'accepted')
    {
        parts.push(`${t.youGive.length} for ${t.youGet.length}`);
        if (t.gifted)
        {
            parts.push('gift');
        }
    }
    parts.push(whenText(t.resolvedAt ?? t.createdAt, now));
    return parts.join(' · ');
}

/**
 * Null once the account can trade; otherwise when it can (accounts trade 7 days
 * after joining). Dates in UTC, like the rest of the game.
 */
export function tradeUnlockText (tradeUnlockedAt: string, now = Date.now(), locale?: string): string | null
{
    const at = Date.parse(tradeUnlockedAt);
    if (now >= at)
    {
        return null;
    }
    const days = Math.ceil((at - now) / (24 * HOUR));
    const date = new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return `Trading unlocks ${days === 1 ? 'tomorrow' : `in ${days} days`} (${date}). New accounts wait a week.`;
}

/** Text for a failed trade request: the server's own message when it sent one. */
export function tradeErrorText (code: string, message?: string): string
{
    if (message)
    {
        return message;
    }
    switch (code)
    {
        case 'network':
            return "Couldn't reach the server. Check your connection and try again.";
        case 'daily_limit':
            return "You've sent today's offers. More at 00:00 UTC.";
        default:
            return 'Something went wrong. Try again.';
    }
}

/** "48 hours" / "1 hour" (the offer expiry from GET /rules). */
export function hoursText (hours: number): string
{
    return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** Header line while picking: "Pick 1 to 5" / "2 of 5 picked" (max: GET /rules maxTradeCards). */
export function pickCountText (picked: number, max: number): string
{
    return picked === 0 ? `Pick 1 to ${max} cards` : `${picked} of ${max} picked`;
}
