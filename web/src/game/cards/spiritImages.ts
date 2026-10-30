// Painted creature art for spirits (src/assets/spirits/<spirit-id>.webp, added with
// `npm run art:import`). Cards draw it where the placeholder silhouette was; spirits
// without art keep their silhouette (spiritArt.ts). No Phaser here: the table and the
// React screens share it.

// Every file in the folder, found at build time (fingerprinted URLs, cached by the offline shell).
const FILES = import.meta.glob('../../assets/spirits/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Spirit id → art URL. */
export const SPIRIT_ART: Record<string, string> = Object.fromEntries(
    Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url])
);

const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | null = null;

/**
 * Loads and decodes all spirit art once (later calls return the same promise). Cards must
 * be drawn after it settles, or they get the silhouette. A file that fails to load just
 * keeps its silhouette.
 */
export function loadSpiritArt (): Promise<void>
{
    loading ??= Promise.all(Object.entries(SPIRIT_ART).map(async ([id, url]) =>
    {
        const img = new Image();
        img.src = url;
        try
        {
            await img.decode();
            images.set(id, img);
        }
        catch (err)
        {
            console.warn(`spirit art ${id}: could not load`, err);
        }
    })).then(() => undefined);
    return loading;
}

/** The loaded art for a spirit, or undefined (not loaded yet, or no art: use the silhouette). */
export function spiritImage (templateId: string): HTMLImageElement | undefined
{
    return images.get(templateId);
}
