// How a player is named to others: the name they chose (PUT /me/name), else their username.
// Pure, so it's testable. The server cleans and checks names (profile.CleanPublicName);
// nameProblem only gives instant feedback while typing.

export interface Named
{
    username: string;
    name?: string;
}

export const MAX_PUBLIC_NAME = 20;

/** What to call the player: their chosen name, or their username. */
export function shownName (p: Named): string
{
    return p.name ?? p.username;
}

/** "@asha" under a chosen name (so nobody can pose as someone else); null when the username shows anyway. */
export function handleText (p: Named): string | null
{
    return p.name ? `@${p.username}` : null;
}

/** Spaces trimmed and collapsed, as the server saves it. */
export function tidyName (name: string): string
{
    return name.trim().split(/\s+/).filter(Boolean).join(' ');
}

/** Why this name would be refused, or null if it looks fine ("" is fine: it shows the username). */
export function nameProblem (name: string): string | null
{
    const tidy = tidyName(name);
    if (tidy === '')
    {
        return null;
    }
    const length = [...tidy].length;
    if (length < 2)
    {
        return 'At least 2 characters.';
    }
    if (length > MAX_PUBLIC_NAME)
    {
        return `At most ${MAX_PUBLIC_NAME} characters.`;
    }
    // Hangul fillers are letters that draw nothing (the server refuses them too).
    if (/[\u115F\u1160\u3164\uFFA0]/u.test(tidy) || !/^[\p{L}\p{M}\p{N} .\-_'‌‍]+$/u.test(tidy))
    {
        return 'Letters, digits, spaces and . - _ \' only (no emoji or symbols).';
    }
    if (!/\p{L}/u.test(tidy))
    {
        return 'Use at least one letter.';
    }
    return null;
}
