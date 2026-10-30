// Profile text and showcase picking (no React here).

/** How many cards a profile can show (server: game.MaxShowcase). */
export const MAX_SHOWCASE = 5;

/**
 * Tapping a card in the showcase picker: adds it at the end (tap order is display order),
 * or removes it if already picked. Full pickers ignore new cards.
 */
export function togglePick (picked: readonly string[], id: string, max = MAX_SHOWCASE): string[]
{
    if (picked.includes(id))
    {
        return picked.filter(p => p !== id);
    }
    return picked.length >= max ? [...picked] : [...picked, id];
}

/** "Joined Oct 2026" (UTC, like the rest of the game). */
export function joinedText (joinedAt: string, locale?: string): string
{
    return `Joined ${new Date(joinedAt).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

export function pickerCountText (picked: number, max = MAX_SHOWCASE): string
{
    return picked === 0 ? `Pick up to ${max} cards` : `${picked} of ${max} picked`;
}
