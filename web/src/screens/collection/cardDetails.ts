// Text for the card detail sheet (no React here).

import type { OwnedCard } from '../../api/cards';

/** "Copy #3", or "Copy #24 of 25" for copy-limited cards. */
export function copyText (c: Pick<OwnedCard, 'copyNo' | 'maxCopies'>): string
{
    return c.maxCopies ? `Copy #${c.copyNo} of ${c.maxCopies}` : `Copy #${c.copyNo}`;
}

/** "#0042 / 1500", as printed on the card; null for cards without season info. */
export function setNumberText (c: Pick<OwnedCard, 'season'>): string | null
{
    return c.season ? `#${String(c.season.setNo).padStart(4, '0')} / ${c.season.setSize}` : null;
}

const VIA: Record<OwnedCard['acquiredVia'], string> = { pack: 'From a pack', merge: 'Made by merging', trade: 'Traded' };

/** "From a pack · 30 Oct 2026". Dates are shown in UTC, like the daily reset. */
export function acquiredText (c: Pick<OwnedCard, 'acquiredVia' | 'acquiredAt'>, locale?: string): string
{
    const date = new Date(c.acquiredAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${VIA[c.acquiredVia]} · ${date}`;
}
