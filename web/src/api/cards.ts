// Server cards → the CardData the card renderer draws. The server sends trait ids;
// the season config (bundled with the client) turns them into colours and labels.

import type { components } from './schema';
import type { CardData } from '../game/cards/model';
import { resolveArt, SEASON_CONFIGS, type SeasonArtConfig } from '../game/cards/seasonArt';

export type ApiCard = components['schemas']['Card'];
export type CardPage = components['schemas']['CardPage'];
export type CardSort = components['schemas']['CardSort'];

/** An owned card as the collection shows it: what the card face draws, plus copy details. */
export interface OwnedCard extends CardData
{
    copyNo: number;
    maxCopies?: number;
    acquiredVia: ApiCard['acquiredVia'];
    acquiredAt: string;
}

/**
 * Cards from a season this client has no config for still render, with the plain
 * element look instead of their trait art (update the app to see them properly).
 */
export function toCardData (c: ApiCard, configs: Record<string, SeasonArtConfig> = SEASON_CONFIGS): OwnedCard
{
    const cfg = configs[c.cardSeasonId];
    const art = cfg ? resolveArt(c.traits, c.artSeed, cfg) : null;
    return {
        id: c.id,
        templateId: c.templateId,
        name: c.name,
        nameSi: c.nameSi,
        element: c.element,
        rarity: c.rarity,
        level: c.level,
        score: c.score,
        lore: c.lore,
        season: art
            ? { seasonCardId: c.seasonCardId, setNo: c.setNo, setSize: c.setSize, title: c.title, subtitle: c.epithet, art }
            : undefined,
        copyNo: c.copyNo,
        maxCopies: c.maxCopies,
        acquiredVia: c.acquiredVia,
        acquiredAt: c.acquiredAt
    };
}
