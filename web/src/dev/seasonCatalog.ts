// DEV ONLY (?showcase): reads the generated Season 1 catalog (server/seasons/s1) so showcase
// packs show real season cards. The real game gets its cards from the API.
// cards.json is ~1 MB, so it is fetched at runtime instead of bundled into the app.

import type { Element, Rarity, SeasonCardInfo } from '../game/cards/model';
import { resolveArt } from '../game/cards/seasonArt';
import config from '../../../server/seasons/s1/config.json';
import cardsUrl from '../../../server/seasons/s1/cards.json?url';

export type SeasonConfig = typeof config;

/** One row of cards.json, as written by server/internal/seasongen. */
export interface CatalogRow
{
    id: string;
    setNo: number;
    template: string;
    rarity: Rarity;
    element: Element;
    name: string;
    title: string;
    epithet: string;
    nameSi: string;
    traits: {
        prefix: string;
        intensity: number;
        adverb: string;
        suffix: string;
        pattern: string;
        palette: string;
        stamp: string;
        foil: string;
        visual?: { tint?: string; effect?: string; accessory?: string; texture?: string };
    };
    score: number;
    dropWeight: number;
    maxCopies: number | null;
    artSeed: number;
}

export interface CatalogFile
{
    id: string;
    cardCount: number;
    cards: CatalogRow[];
}

/** A catalog card ready to hand out: display info plus what the fake roll needs. */
export interface CatalogEntry
{
    templateId: string;
    name: string;
    nameSi: string;
    element: Element;
    rarity: Rarity;
    lore: string;
    /** Score at level 1. */
    score: number;
    dropWeight: number;
    maxCopies: number | null;
    season: SeasonCardInfo;
}

export interface Catalog
{
    id: string;
    entries: CatalogEntry[];
    byId: Map<string, CatalogEntry>;
}

type ConfigLike = Pick<SeasonConfig, 'spirits' | 'palettes' | 'stamps'>;

/** Resolves trait ids to concrete visuals (palette colours, stamp label) using the season config. */
export function buildCatalog (file: CatalogFile, cfg: ConfigLike = config): Catalog
{
    const lore = new Map(cfg.spirits.map(s => [s.id, s.lore]));

    const entries = file.cards.map((row): CatalogEntry =>
    {
        const art = resolveArt(row.traits, row.artSeed, cfg);
        if (!art)
        {
            throw new Error(`${row.id}: unknown palette ${row.traits.palette}`);
        }
        return {
            templateId: row.template,
            name: row.name,
            nameSi: row.nameSi,
            element: row.element,
            rarity: row.rarity,
            lore: lore.get(row.template) ?? '',
            score: row.score,
            dropWeight: row.dropWeight,
            maxCopies: row.maxCopies,
            season: {
                seasonCardId: row.id,
                setNo: row.setNo,
                setSize: file.cardCount,
                title: row.title,
                subtitle: subtitle(row.name, row.title),
                art
            }
        };
    });

    return { id: file.id, entries, byId: new Map(entries.map(e => [e.season.seasonCardId, e])) };
}

/** "Brightly Moonlit Gaja Calf of Kandy" minus "Gaja Calf" → "Brightly Moonlit · of Kandy". */
export function subtitle (name: string, title: string): string
{
    const at = name.indexOf(title);
    if (at < 0)
    {
        return '';
    }
    const before = name.slice(0, at).trim();
    const after = name.slice(at + title.length).trim();
    return [before, after].filter(Boolean).join(' · ');
}

export async function loadSeasonCatalog (): Promise<Catalog>
{
    const res = await fetch(cardsUrl);
    if (!res.ok)
    {
        throw new Error(`season catalog: HTTP ${res.status}`);
    }
    return buildCatalog(await res.json() as CatalogFile);
}

export const SEASON_SPIRITS = config.spirits;
