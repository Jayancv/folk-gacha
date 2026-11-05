// What the Help screen says, as data (no React), with the numbers from GET /rules so it never
// goes out of date. Tested in helpModel.test.ts.

import type { GameRules } from '../../app/useRules';
import { RARITIES, RARITY_STYLE, type Rarity } from '../../game/cards/model';

export interface HelpSection
{
    id: string;
    icon: string;
    title: string;
    /** Paragraphs; a line starting with "• " is a bullet. */
    lines: string[];
}

/** "05:30" for a player in Sri Lanka: when 00:00 UTC is on their clock. */
export function localResetTime (locale?: string, timeZone?: string): string
{
    return new Date(Date.UTC(2026, 0, 5)).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone });
}

/** "1 in 5", "1 in 56", "1 in 500": a chance in percent as odds per card ("most cards" from 50%). */
export function oddsText (percent: number): string
{
    if (percent <= 0)
    {
        return 'never';
    }
    if (percent >= 50)
    {
        return 'most cards';
    }
    return `1 in ${Math.round(100 / percent)}`;
}

/** "70%", "1.8%", "0.2%". */
export function percentText (percent: number): string
{
    return `${Number(percent.toFixed(2))}%`;
}

export interface OddsRow
{
    rarity: Rarity;
    label: string;
    color: string;
    percent: string;
    odds: string;
}

/** The pack odds table, most common first. */
export function oddsRows (rules: GameRules): OddsRow[]
{
    return RARITIES.map(r => ({
        rarity: r,
        label: RARITY_STYLE[r].label,
        color: RARITY_STYLE[r].color,
        percent: percentText(rules.dropChancePercent[r]),
        odds: oddsText(rules.dropChancePercent[r])
    }));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function helpSections (rules: GameRules, resetTime: string): HelpSection[]
{
    const trading: string[] = [
        'Find a player on the Ranks tab or a tournament\'s results, open their profile and tap Propose trade.',
        `• Up to ${plural(rules.maxTradeCards, 'card')} on each side.`,
        `• ${plural(rules.dailyOfferLimit, 'offer')} a day; an offer expires after ${plural(rules.offerExpiryHours, 'hour')}.`,
        '• Cards in an open offer are locked: you can\'t merge them until the offer ends.',
        '• Traded cards never earn leaderboard points (so nobody can farm points with a second account).'
    ];
    if (rules.newAccountWaitDays > 0)
    {
        trading.push(`• New accounts can trade ${plural(rules.newAccountWaitDays, 'day')} after signing up.`);
    }
    if (rules.partnerGiftsPerWeek > 0)
    {
        trading.push(`Your first trade with a new partner gives you both a gift card, opened on the Pack tab (up to ${plural(rules.partnerGiftsPerWeek, 'gift')} a week).`);
    }

    return [
        {
            id: 'pack',
            icon: '🎴',
            title: 'Your daily pack',
            lines: [
                `Every day you get a free pack of 5 spirit cards. A new one is ready at 00:00 UTC (${resetTime} on your clock).`,
                '• Tap "Open today\'s pack", then tap or swipe the cards to flip them.',
                `• Missed a day? Unopened packs are kept, up to ${plural(Math.floor(rules.maxUnopenedCards / 5), 'pack')} (${rules.maxUnopenedCards} cards). Any more are lost, so open them before then.`,
                `• Bad luck protection: you always get a Rare or better at least once every ${plural(rules.pityPacks, 'pack')}.`,
                'Turn on "Notify me" on the Pack tab to get a reminder when your pack is ready.'
            ]
        },
        {
            id: 'rarity',
            icon: '✨',
            title: 'Rarities and odds',
            lines: [
                'Each card in a pack is rolled by the server with these chances:',
                'Rarer cards score more. Epic and Legendary cards are limited: each one only has a set number of numbered copies, ever.'
            ]
        },
        {
            id: 'merge',
            icon: '⬆️',
            title: 'Merging and levels',
            lines: [
                'Two cards of the same spirit and the same level merge into one card a level higher, up to level 5 (★★★★★). Each level is worth about twice the score.',
                'Some different spirits combine into a brand new one. These recipes are secret until you find them!',
                '• Board: swipe to scroll. Hold a card for a moment to pick it up, then drop it on another. Cards that can level up glow and are shown first.',
                '• List: cards with a ✦ mark have a partner. Tap a card, then Merge to jump to it on the Board.',
                '• Tap a card on the Board to see it up close.'
            ]
        },
        {
            id: 'ranks',
            icon: '🏆',
            title: 'Weekly leaderboard',
            lines: [
                'Each week runs from Monday 00:00 UTC to Sunday night. Your points for the week are the scores of the cards you pull from packs and make by merging.',
                '• Merging high-level cards earns the most: a level 5 card is worth far more than its parts.',
                '• Traded and gift cards earn no points.',
                'All time adds up every week you have played.'
            ]
        },
        {
            id: 'trades',
            icon: '🔁',
            title: 'Trading',
            lines: trading
        },
        {
            id: 'tournaments',
            icon: '🚩',
            title: 'Tournaments',
            lines: [
                'Daily and weekly tournaments score a lineup of your cards. Each one has its own format (Power, Element trial, Rarity cap, Underdog, Harmony), so a different collection can win each time.',
                '• Pick 1 card up to the lineup size while entries are open; you can change it until they close.',
                '• Entered cards are locked until the tournament ends, and can\'t enter the next tournament of the same series.',
                '• When entries close, every lineup is scored and ranked. Tap a result to see why it placed.',
                '• Top places win prize cards, opened on the Pack tab.'
            ]
        },
        {
            id: 'fair',
            icon: '⚖️',
            title: 'Fair play',
            lines: [
                'The server decides every pack, merge, trade and score; the app only shows them, so nobody can cheat from their phone.',
                'Tournament ties are broken with a random seed whose fingerprint is published before entries close, and the seed itself after: you can check nobody changed it.'
            ]
        },
        {
            id: 'app',
            icon: '📱',
            title: 'App tips',
            lines: [
                '• Install it: on Android tap Install when offered; on iPhone tap Share, then Add to Home Screen.',
                '• The speaker button next to your name turns sounds on or off.',
                '• Tap your name to see your profile and choose the cards you show off.'
            ]
        }
    ];
}
