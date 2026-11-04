// Text for the daily pack panel (no React here).

import type { ClaimError, GiftError, GiftFrom } from '../../api/game';
import { placeText } from '../tournaments/tournamentModel';

/** "Next pack in 5h 12m" until the 00:00 UTC reset; rounds up so it never says 0m early. */
export function nextPackText (nextResetAt: string, now: number): string
{
    const ms = Date.parse(nextResetAt) - now;
    if (!(ms > 0))
    {
        return 'Your next pack is ready';
    }
    const minutes = Math.ceil(ms / 60_000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `Next pack in ${h > 0 ? `${h}h ${m}m` : `${m}m`}`;
}

/**
 * The title over opened gifts. Trade gifts: "Gift from asha" / "Gifts from asha and ben" /
 * "Gifts from asha, ben and 2 more". Tournament prizes: "Prize · 1st in Daily Cup" /
 * "Tournament prizes". Both at once: "Gifts and prizes".
 */
export function giftTitle (from: readonly GiftFrom[]): string
{
    const prizes = from.filter(f => 'tournament' in f);
    if (prizes.length > 0)
    {
        if (prizes.length < from.length)
        {
            return 'Gifts and prizes';
        }
        const won = [...new Set(prizes.map(p => `${placeText(p.place)} in ${p.tournament}`))];
        return won.length === 1 ? `${prizes.length > 1 ? 'Prizes' : 'Prize'} · ${won[0]}` : 'Tournament prizes';
    }
    const partners = from.flatMap(f => ('partner' in f ? [f.partner] : []));
    const names = [...new Set(partners)];
    if (names.length === 0)
    {
        return 'Trade gift';
    }
    const plural = partners.length > 1 ? 'Gifts' : 'Gift';
    if (names.length === 1)
    {
        return `${plural} from ${names[0]}`;
    }
    if (names.length === 2)
    {
        return `${plural} from ${names[0]} and ${names[1]}`;
    }
    return `${plural} from ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** The button that opens waiting trade gifts and tournament prizes (up to 5 per open). */
export function giftButtonText (waiting: number): string
{
    return waiting === 1 ? 'Open your gift' : `Open ${Math.min(waiting, 5)} gifts`;
}

export function giftErrorText (error: GiftError): string
{
    switch (error)
    {
        case 'no_gifts':
            return 'No gifts waiting.';
        case 'sold_out':
            return 'No gift cards are left this season.';
        case 'no_season':
            return 'No card season is open right now.';
        case 'signed_out':
            return 'Signed out. Sign in again.';
        case 'network':
            return "Couldn't reach the server. Try again.";
    }
}

export function claimErrorText (error: ClaimError): string
{
    switch (error)
    {
        case 'already_claimed':
            return "Today's pack is already open.";
        case 'no_season':
            return "Packs aren't available right now. Try again later.";
        case 'signed_out':
            return 'Your session ended. Sign in again.';
        case 'network':
            return "Couldn't reach the server. Try again.";
    }
}
