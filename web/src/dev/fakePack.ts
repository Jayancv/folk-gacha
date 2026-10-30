// DEV AND TESTS ONLY: fake card data. Tests use it as a card factory, and ?showcase deals
// local packs from it (loaded on demand by Game.tsx) to tune the reveal effects.
// The real game never rolls here: packs come from POST /packs/daily/claim.

import type { CardData, Element, Rarity } from '../game/cards/model';
import { RARITIES } from '../game/cards/model';
import { SEASON_SPIRITS, type Catalog, type CatalogEntry } from './seasonCatalog';

export interface Template
{
    templateId: string;
    name: string;
    nameSi: string;
    element: Element;
    rarity: Rarity;
    lore: string;
}

// The spirits from server/seasons/s1/config.json. Sinhala names still need a native-speaker check.
export const TEMPLATES: Template[] = SEASON_SPIRITS.map(s => ({
    templateId: s.id,
    name: s.name,
    nameSi: s.nameSi,
    element: s.element as Element,
    rarity: s.rarity as Rarity,
    lore: s.lore
}));

const BASE_SCORE: Record<Rarity, number> = { common: 10, uncommon: 25, rare: 60, epic: 150, legendary: 400 };

// Drop chances from CLAUDE.md (percent).
const ODDS: [Rarity, number][] = [['common', 70], ['uncommon', 20], ['rare', 8], ['epic', 1.8], ['legendary', 0.2]];

const PACK_SIZE = 5;
const LEVEL_MULT = 2.2;

/** Score at `level` from the level-1 score: ×2.2 per level, rounded. */
export function levelScore (level1: number, level: number): number
{
    return Math.round(level1 * Math.pow(LEVEL_MULT, level - 1));
}

export function cardScore (rarity: Rarity, level: number): number
{
    return levelScore(BASE_SCORE[rarity], level);
}

let nextId = 1;
const newId = () => `fake-${nextId++}`;

export function makeCard (t: Template, level = 1): CardData
{
    return { ...t, id: newId(), level, score: cardScore(t.rarity, level) };
}

export function makeSeasonCard (e: CatalogEntry, level = 1): CardData
{
    return {
        id: newId(),
        templateId: e.templateId,
        name: e.name,
        nameSi: e.nameSi,
        element: e.element,
        rarity: e.rarity,
        lore: e.lore,
        level,
        score: levelScore(e.score, level),
        season: e.season
    };
}

export function rollRarity (rand: () => number): Rarity
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

/** Picks by weight; `weights[i]` <= 0 is never picked. Returns -1 if nothing can be picked. */
export function weightedIndex (weights: number[], rand: () => number): number
{
    const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
    if (total <= 0)
    {
        return -1;
    }
    let t = rand() * total;
    let last = -1;
    for (let i = 0; i < weights.length; i++)
    {
        if (weights[i] <= 0)
        {
            continue;
        }
        last = i;
        if ((t -= weights[i]) < 0)
        {
            return i;
        }
    }
    return last;
}

function shuffle<T> (list: T[], rand: () => number): T[]
{
    for (let i = list.length - 1; i > 0; i--)
    {
        const j = Math.floor(rand() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

/** Where fake cards come from: plain templates, or the Season 1 catalog. */
export interface CardSource
{
    /** A daily pack: 5 cards rolled by rarity odds. */
    pack (rand?: () => number): CardData[];
    /** One card of every rarity in random order, for tuning the reveal effects. */
    showcase (rand?: () => number): CardData[];
    /** A new level-1 card of a template (recipe output). */
    create (templateId: string, rand?: () => number): CardData;
    /** The same card one level up. */
    levelUp (card: CardData): CardData;
}

function template (id: string): Template
{
    const t = TEMPLATES.find(t => t.templateId === id);
    if (!t)
    {
        throw new Error(`unknown template ${id}`);
    }
    return t;
}

/** Plain template cards (no season traits). Used by tests and as a fallback. */
export const templateSource: CardSource = {
    pack: (rand = Math.random) => Array.from({ length: PACK_SIZE }, () =>
    {
        const rarity = rollRarity(rand);
        return makeCard(pick(TEMPLATES.filter(t => t.rarity === rarity), rand));
    }),
    showcase: (rand = Math.random) => shuffle(RARITIES.map(r => makeCard(pick(TEMPLATES.filter(t => t.rarity === r), rand))), rand),
    create: id => makeCard(template(id)),
    levelUp: card => makeCard(template(card.templateId), card.level + 1)
};

/**
 * Season 1 cards, rolled like the server will (CLAUDE.md, "Pack roll"): pick a rarity by
 * drop chance, then a catalog card of that rarity by dropWeight, skipping cards whose
 * maxCopies are used up. `minted` counts copies handed out in this browser session.
 */
export function seasonSource (catalog: Catalog): CardSource
{
    const minted = new Map<string, number>();
    const byRarity = new Map<Rarity, CatalogEntry[]>(RARITIES.map(r => [r, catalog.entries.filter(e => e.rarity === r)]));

    const available = (e: CatalogEntry) => e.maxCopies === null || (minted.get(e.season.seasonCardId) ?? 0) < e.maxCopies;

    const mint = (pool: CatalogEntry[], rand: () => number): CardData | null =>
    {
        const i = weightedIndex(pool.map(e => (available(e) ? e.dropWeight : 0)), rand);
        if (i < 0)
        {
            return null;
        }
        const e = pool[i];
        minted.set(e.season.seasonCardId, (minted.get(e.season.seasonCardId) ?? 0) + 1);
        return makeSeasonCard(e);
    };

    /** Falls back to the next more common rarity when a rarity is sold out. */
    const mintRarity = (rarity: Rarity, rand: () => number): CardData =>
    {
        for (let r = RARITIES.indexOf(rarity); r >= 0; r--)
        {
            const card = mint(byRarity.get(RARITIES[r]) ?? [], rand);
            if (card)
            {
                return card;
            }
        }
        throw new Error('season catalog is sold out');
    };

    return {
        pack: (rand = Math.random) => Array.from({ length: PACK_SIZE }, () => mintRarity(rollRarity(rand), rand)),
        showcase: (rand = Math.random) => shuffle(RARITIES.map(r => mintRarity(r, rand)), rand),
        create: (templateId, rand = Math.random) =>
        {
            const card = mint(catalog.entries.filter(e => e.templateId === templateId), rand);
            if (!card)
            {
                throw new Error(`no catalog card left for ${templateId}`);
            }
            return card;
        },
        levelUp: card =>
        {
            // Same season card (same look), one level higher.
            const e = card.season && catalog.byId.get(card.season.seasonCardId);
            if (!e)
            {
                return templateSource.levelUp(card);
            }
            return makeSeasonCard(e, card.level + 1);
        }
    };
}

export function fakeClaimPack (rand: () => number = Math.random): CardData[]
{
    return templateSource.pack(rand);
}

export function fakeShowcasePack (rand: () => number = Math.random): CardData[]
{
    return templateSource.showcase(rand);
}
