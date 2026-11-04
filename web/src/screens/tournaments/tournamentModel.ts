// Tournament screens without React: grouping, the one-line rules, times, what can't be
// picked, and error text. The server checks and scores every lineup; this only explains.

import type { OwnedCard } from '../../api/cards';
import type { components } from '../../api/schema';

export type Tournament = components['schemas']['Tournament'];
export type TournamentFormat = components['schemas']['TournamentFormat'];
export type TournamentDetail = components['schemas']['TournamentDetail'];
export type TournamentEntry = components['schemas']['TournamentEntry'];
export type LineupScore = components['schemas']['LineupScore'];
export type Rarity = OwnedCard['rarity'];

const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_NAME: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const ELEMENT_NAME: Record<string, string> = { earth: 'Earth', fire: 'Fire', water: 'Water', wind: 'Wind', forest: 'Forest' };

/** How often the list refreshes (statuses change on the hour, entries come and go). */
export const TOURNAMENTS_POLL_MS = 60_000;

/** The Tournament screen's sections: running now, coming up, and the past week (server order, newest first). */
export function groupTournaments (list: readonly Tournament[], upcoming: readonly Tournament[]): { now: Tournament[]; next: Tournament[]; past: Tournament[] }
{
    return {
        now: list.filter(t => t.status === 'open' || t.status === 'locked'),
        next: [...upcoming],
        past: list.filter(t => t.status === 'finished')
    };
}

/** Open tournaments you haven't entered yet (the tab badge). */
export function openToEnterCount (list: readonly Tournament[]): number
{
    return list.filter(t => t.status === 'open' && !t.entered).length;
}

/** The format in one line: "4 cards · Water cards score ×2". */
export function formatRule (f: TournamentFormat, element?: string): string
{
    return `Up to ${f.slots} cards · ${formatDetail(f, element)}`;
}

function formatDetail (f: TournamentFormat, element?: string): string
{
    const spirit = f.onePerSpirit ? ', one per spirit' : '';
    switch (f.kind)
    {
        case 'power':
            return `Highest total score wins${spirit}`;
        case 'element-trial':
            return `${element ? ELEMENT_NAME[element] ?? element : 'The trial element'} cards score ×${f.elementMultiplier ?? 2}${spirit}`;
        case 'rarity-cap':
        {
            const cap = f.maxRarity ? RARITY_NAME[f.maxRarity] : 'Low rarity';
            const above = f.allowAbove ? `, plus ${f.allowAbove} better card${f.allowAbove === 1 ? '' : 's'}` : '';
            return `${cap} or lower only${above}${spirit}`;
        }
        case 'underdog':
            return `Score divided by rarity: a levelled-up Common can beat a fresh Rare${spirit}`;
        case 'harmony':
            return `+${f.harmonyBonusPercent ?? 10}% for each element after the first${spirit}`;
    }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "in 12 min" / "in 5 h" / "in 2 d" / "now". */
export function untilText (at: string, now = Date.now()): string
{
    const left = Date.parse(at) - now;
    if (left < MINUTE)
    {
        return 'now';
    }
    if (left < HOUR)
    {
        return `in ${Math.floor(left / MINUTE)} min`;
    }
    if (left < DAY)
    {
        return `in ${Math.floor(left / HOUR)} h`;
    }
    return `in ${Math.floor(left / DAY)} d`;
}

/** Where a tournament stands, in one line. */
export function statusLine (t: Pick<Tournament, 'status' | 'opensAt' | 'closesAt' | 'endsAt'>, now = Date.now(), locale?: string): string
{
    switch (t.status)
    {
        case 'upcoming':
            return `Opens ${untilText(t.opensAt, now)}`;
        case 'open':
            return `Entries close ${untilText(t.closesAt, now)}`;
        case 'locked':
            return `Results are in · cards free ${untilText(t.endsAt, now)}`;
        case 'finished':
            return `Finished ${new Date(t.endsAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
    }
}

/** "1 player" / "12 players". */
export function entriesText (n: number): string
{
    return n === 1 ? '1 player' : `${n} players`;
}

/** "×2" / "×0.4" / "" for ×1 (nothing changed). */
export function multiplierText (m: number): string
{
    if (Math.abs(m - 1) < 1e-9)
    {
        return '';
    }
    return `×${Number(m.toFixed(m < 1 ? 2 : 1))}`;
}

/** "1st 3 cards · 2nd 2 · 3rd 1", or null when the tournament gives no prizes. */
export function prizesText (prizes: readonly number[]): string | null
{
    if (prizes.length === 0)
    {
        return null;
    }
    return prizes.map((n, i) => (i === 0 ? `${placeText(1)} ${n} ${n === 1 ? 'card' : 'cards'}` : `${placeText(i + 1)} ${n}`)).join(' · ');
}

/** Prize cards a place wins (0 outside the prize places). */
export function prizeFor (prizes: readonly number[], rank: number | undefined): number
{
    return rank && rank >= 1 && rank <= prizes.length ? prizes[rank - 1] : 0;
}

/** "Pick 1 to 4 cards" / "2 of up to 4 picked": a lineup has 1 card up to the format's slots. */
export function lineupCountText (picked: number, slots: number): string
{
    return picked === 0 ? `Pick 1 to ${slots} cards` : `${picked} of up to ${slots} picked`;
}

/**
 * Why a card can't go into the lineup now, or null if it can. A hint only: the server
 * also checks ownership and the "played in the series' last tournament" cooldown.
 * `picked` is the lineup so far; `entered` the cards of your saved entry (locked in this
 * tournament, so still allowed).
 */
export function pickBlock (
    card: OwnedCard,
    t: Pick<Tournament, 'format' | 'opensAt'>,
    picked: readonly OwnedCard[],
    entered: readonly string[]
): string | null
{
    if (picked.some(p => p.id === card.id))
    {
        return null; // tapping it again takes it out
    }
    if (card.inTrade)
    {
        return 'In a trade';
    }
    if (card.inTournament && !entered.includes(card.id))
    {
        return 'In an event';
    }
    if ((card.acquiredVia === 'trade' || card.acquiredVia === 'gift') && Date.parse(card.acquiredAt) > Date.parse(t.opensAt))
    {
        return 'Traded too late';
    }
    const f = t.format;
    if (f.onePerSpirit && picked.some(p => p.templateId === card.templateId))
    {
        return 'Same spirit';
    }
    if (f.kind === 'rarity-cap' && f.maxRarity && above(card.rarity, f.maxRarity))
    {
        const used = picked.filter(p => above(p.rarity, f.maxRarity!)).length;
        if (used >= (f.allowAbove ?? 0))
        {
            return 'Too rare';
        }
    }
    return null;
}

function above (r: Rarity, cap: Rarity): boolean
{
    return RARITIES.indexOf(r) > RARITIES.indexOf(cap);
}

/** Text for a failed entry, preview or withdraw: the server's own message when it sent one. */
export function tournamentErrorText (code: string, message?: string): string
{
    if (message)
    {
        return message;
    }
    switch (code)
    {
        case 'network':
            return "Couldn't reach the server. Check your connection and try again.";
        case 'closed':
            return 'Entries are closed: lineups are final.';
        case 'cooldown':
            return 'One of these cards played in the last tournament of this series. It sits this one out.';
        default:
            return 'Something went wrong. Try again.';
    }
}

/** "1st" / "2nd" / "3rd" / "11th". */
export function placeText (rank: number): string
{
    const tens = rank % 100;
    if (tens >= 11 && tens <= 13)
    {
        return `${rank}th`;
    }
    return `${rank}${['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th'}`;
}

/** "Wed 20:00 UTC": a tournament time, in UTC like the rest of the game. */
export function utcTimeText (at: string, locale?: string): string
{
    const d = new Date(at);
    const day = d.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
    return `${day} ${time} UTC`;
}

/** Points for each card of a scored lineup, by card id. */
export function pointsByCard (score: LineupScore | undefined): Map<string, { points: number; multiplier: number }>
{
    return new Map((score?.cards ?? []).map(c => [c.cardId, { points: c.points, multiplier: c.multiplier }]));
}
