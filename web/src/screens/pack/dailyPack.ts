// Text for the daily pack panel (no React here).

import type { ClaimError } from '../../api/game';

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
