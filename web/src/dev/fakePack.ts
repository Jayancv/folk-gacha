// PHASE 1 ONLY: fake pack data so the game table can be built before the server exists.
// In Phase 2 the server rolls packs (POST /packs/daily/claim) and this file goes away.
// Never ship client-side rolls: the server decides every outcome.

import type { CardData, Element, Rarity } from '../game/cards/model';
import { RARITIES } from '../game/cards/model';

interface Template
{
    templateId: string;
    name: string;
    nameSi: string;
    element: Element;
    rarity: Rarity;
    lore: string;
}

// Sample cards from docs/design/lanka-mythics-preview.html. Sinhala names still need a native-speaker check.
const TEMPLATES: Template[] = [
    { templateId: 'gaja-calf', name: 'Gaja Calf', nameSi: 'ඇත් පැටියා', rarity: 'common', element: 'earth', lore: 'Follows the Perahera drums and naps through the fire dancers.' },
    { templateId: 'malu', name: 'Malu Sprite', nameSi: 'මාළු', rarity: 'common', element: 'water', lore: 'Lives in temple ponds and nibbles on lotus petals.' },
    { templateId: 'monara', name: 'Monara Chick', nameSi: 'මොනරා', rarity: 'common', element: 'wind', lore: 'Practices its tail fan every morning, waiting for rain.' },
    { templateId: 'ura', name: 'Ura Boarlet', nameSi: 'වල් ඌරා', rarity: 'uncommon', element: 'forest', lore: 'Roots through the forest floor looking for moonstones.' },
    { templateId: 'simha', name: 'Simha Cub', nameSi: 'සිංහ පැටියා', rarity: 'uncommon', element: 'fire', lore: 'Its roar is still a squeak, but its mane is already ablaze.' },
    { templateId: 'gajasinghe', name: 'Gajasinghe', nameSi: 'ගජසිංහ', rarity: 'rare', element: 'earth', lore: 'Elephant strength, lion heart. Guards the old gateways.' },
    { templateId: 'serapendiya', name: 'Serapendiya', nameSi: 'සේරපෙන්දිය', rarity: 'rare', element: 'wind', lore: 'Curled-beak bird of Sinhala art, carved on kasthane hilts.' },
    { templateId: 'naga-raksha', name: 'Naga Raksha', nameSi: 'නාග රාක්ෂ', rarity: 'epic', element: 'water', lore: 'Crowned with cobras, risen from the masks of Ambalangoda.' },
    { templateId: 'gurulu-raksha', name: 'Gurulu Raksha', nameSi: 'ගුරුළු රාක්ෂ', rarity: 'epic', element: 'wind', lore: 'Strikes from the sky with a cobra in its beak.' },
    { templateId: 'makara', name: 'Makara', nameSi: 'මකර', rarity: 'legendary', element: 'water', lore: 'Elephant front, lion feet, boar ear, fish body. Guardian of the thorana.' }
];

const BASE_SCORE: Record<Rarity, number> = { common: 10, uncommon: 25, rare: 60, epic: 150, legendary: 400 };

// Drop chances from CLAUDE.md (percent).
const ODDS: [Rarity, number][] = [['common', 70], ['uncommon', 20], ['rare', 8], ['epic', 1.8], ['legendary', 0.2]];

export function cardScore (rarity: Rarity, level: number): number
{
    return Math.round(BASE_SCORE[rarity] * Math.pow(2.2, level - 1));
}

let nextId = 1;

function makeCard (t: Template): CardData
{
    return { ...t, id: `fake-${nextId++}`, level: 1, score: cardScore(t.rarity, 1) };
}

function rollRarity (rand: () => number): Rarity
{
    let t = rand() * 100;
    for (const [rarity, weight] of ODDS)
    {
        if ((t -= weight) < 0)
        {
            return rarity;
        }
    }
    return 'common';
}

function pick<T> (list: T[], rand: () => number): T
{
    return list[Math.floor(rand() * list.length)];
}

export function fakeClaimPack (rand: () => number = Math.random): CardData[]
{
    return Array.from({ length: 5 }, () =>
    {
        const rarity = rollRarity(rand);
        return makeCard(pick(TEMPLATES.filter(t => t.rarity === rarity), rand));
    });
}

// One card of every rarity in random order, for tuning the reveal effects.
export function fakeShowcasePack (rand: () => number = Math.random): CardData[]
{
    const cards = RARITIES.map(r => makeCard(pick(TEMPLATES.filter(t => t.rarity === r), rand)));
    for (let i = cards.length - 1; i > 0; i--)
    {
        const j = Math.floor(rand() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}
