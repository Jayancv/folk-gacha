// Text for the leaderboard screen (no React here). Weeks are UTC, like the server.

import type { components } from '../../api/schema';

type Season = components['schemas']['LeaderboardSeason'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Week 44 · 26 Oct – 1 Nov" (Monday to Sunday, UTC). */
export function weekLabel (season: Season, locale?: string): string
{
    const week = Number(season.id.split('-W')[1]);
    const fmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const sunday = Date.parse(season.endsAt) - DAY_MS;
    return `Week ${week} · ${fmt(Date.parse(season.startsAt))} – ${fmt(sunday)}`;
}

/** "Ends in 2d 5h", "Ends in 3h 12m", "Ends in 12m" (rounded up), until Monday 00:00 UTC. */
export function timeLeftText (endsAt: string, now: number): string
{
    const ms = Date.parse(endsAt) - now;
    if (!(ms > 0))
    {
        return 'Week over: final standings soon';
    }
    const minutes = Math.ceil(ms / 60_000);
    const d = Math.floor(minutes / (24 * 60));
    const h = Math.floor((minutes % (24 * 60)) / 60);
    const m = minutes % 60;
    if (d > 0)
    {
        return `Ends in ${d}d ${h}h`;
    }
    return h > 0 ? `Ends in ${h}h ${m}m` : `Ends in ${m}m`;
}

/** Medal colour for the top 3 (they win the week's cosmetic reward), else null. */
export function medal (rank: number): string | null
{
    return ['#ffd66e', '#d4d8dc', '#d08a52'][rank - 1] ?? null;
}

export function playersText (players: number): string
{
    return players === 1 ? '1 player ranked' : `${players} players ranked`;
}
