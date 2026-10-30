// Turns a season card's trait ids (as the server and cards.json send them) into
// concrete visuals (palette colours, stamp label) using that season's config.

import type { CardArt, Foil, TraitIntensity } from './model';
import s1 from '../../../../server/seasons/s1/config.json';

/** The trait part of a season config the art needs. */
export interface SeasonArtConfig
{
    palettes: { id: string; colors: string[] }[];
    stamps: { id: string; name: string }[];
}

/** Configs of the card seasons this client can draw. Add each new season here. */
export const SEASON_CONFIGS: Record<string, SeasonArtConfig> = { s1 };

/** Trait ids of one card (cards.json `traits`, API `Card.traits`). */
export interface TraitIds
{
    pattern: string;
    palette: string;
    stamp: string;
    foil: string;
    intensity: number;
    visual?: { tint?: string; effect?: string; accessory?: string; texture?: string };
}

/** The card's art, or null when the config doesn't know its palette. */
export function resolveArt (t: TraitIds, artSeed: number, cfg: SeasonArtConfig): CardArt | null
{
    const colors = cfg.palettes.find(p => p.id === t.palette)?.colors;
    if (!colors || colors.length < 2)
    {
        return null;
    }
    const stampName = cfg.stamps.find(s => s.id === t.stamp)?.name;
    return {
        pattern: t.pattern,
        palette: [colors[0], colors[1]],
        tint: t.visual?.tint,
        effect: t.visual?.effect,
        accessory: t.visual?.accessory,
        texture: t.visual?.texture,
        intensity: Math.min(3, Math.max(1, t.intensity)) as TraitIntensity,
        stamp: t.stamp && t.stamp !== 'none' ? { id: t.stamp, label: stampName || t.stamp } : undefined,
        foil: (t.foil === 'gold' || t.foil === 'holo' ? t.foil : 'none') as Foil,
        seed: artSeed
    };
}
