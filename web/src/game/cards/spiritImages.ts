// Painted creature art for spirits (src/assets/spirits/<spirit-id>.webp, added with
// `npm run art:import`). Cards draw it where the placeholder silhouette was; spirits
// without art keep their silhouette (spiritArt.ts). No Phaser here: the table and the
// React screens share it.
//
// A spirit can grow up as it levels: <spirit-id>.baby.webp for level 1,
// <spirit-id>.young.webp for levels 2–3, and the plain <spirit-id>.webp (adult) for 4–5.
// A missing stage falls back to the nearest one that exists.

export type ArtStage = 'baby' | 'young' | 'adult';
export const ART_STAGES: readonly ArtStage[] = ['baby', 'young', 'adult'];

// Every file in the folder, found at build time (fingerprinted URLs, cached by the offline shell).
const FILES = import.meta.glob('../../assets/spirits/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Art key ("hansa", "hansa.baby") → art URL. */
export const SPIRIT_ART: Record<string, string> = Object.fromEntries(
    Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url])
);

/** Splits an art key into its spirit id and stage ("hansa.baby" → hansa, baby; "hansa" → hansa, adult). */
export function parseArtKey (key: string): { spirit: string; stage: string }
{
    const dot = key.indexOf('.');
    return dot < 0 ? { spirit: key, stage: 'adult' } : { spirit: key.slice(0, dot), stage: key.slice(dot + 1) };
}

/** The growth stage a card of this level shows. */
export function stageForLevel (level: number): ArtStage
{
    return level <= 1 ? 'baby' : level <= 3 ? 'young' : 'adult';
}

const artKey = (spirit: string, stage: ArtStage) => (stage === 'adult' ? spirit : `${spirit}.${stage}`);

/** Art keys to try for a card, best first: its own stage, then the nearest other stages. */
export function artKeysFor (templateId: string, level: number): string[]
{
    const order: Record<ArtStage, ArtStage[]> = {
        baby: ['baby', 'young', 'adult'],
        young: ['young', 'adult', 'baby'],
        adult: ['adult', 'young', 'baby']
    };
    return order[stageForLevel(level)].map(s => artKey(templateId, s));
}

const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | null = null;

/**
 * Loads and decodes all spirit art once (later calls return the same promise). Cards must
 * be drawn after it settles, or they get the silhouette. A file that fails to load just
 * keeps its silhouette.
 */
export function loadSpiritArt (): Promise<void>
{
    loading ??= Promise.all(Object.entries(SPIRIT_ART).map(async ([key, url]) =>
    {
        const img = new Image();
        img.src = url;
        try
        {
            await img.decode();
            images.set(key, img);
        }
        catch (err)
        {
            console.warn(`spirit art ${key}: could not load`, err);
        }
    })).then(() => undefined);
    return loading;
}

/** The loaded art for a card's spirit at its level, or undefined (not loaded yet, or no art: use the silhouette). */
export function spiritImage (templateId: string, level: number): HTMLImageElement | undefined
{
    for (const key of artKeysFor(templateId, level))
    {
        const img = images.get(key);
        if (img)
        {
            return img;
        }
    }
    return undefined;
}
