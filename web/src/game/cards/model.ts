// Card data as the game table sees it. In Phase 2 this will come from the API
// (generated types); the server decides every value here.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Element = 'earth' | 'fire' | 'water' | 'wind' | 'forest';

export interface CardData
{
    /** Unique id of this owned copy. */
    id: string;
    templateId: string;
    name: string;
    /** Sinhala name. */
    nameSi: string;
    element: Element;
    rarity: Rarity;
    /** 1..5 */
    level: number;
    score: number;
    lore: string;
}

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export function rarityRank (r: Rarity): number
{
    return RARITIES.indexOf(r);
}

export interface RarityStyle
{
    label: string;
    /** Accent used for the rarity label and particles. */
    color: string;
    /** Frame gradient stops, top-left to bottom-right. */
    frame: string[];
    /** Glow tint, or null for no glow. */
    glow: number | null;
}

// Colors from docs/design/lanka-mythics-preview.html
export const RARITY_STYLE: Record<Rarity, RarityStyle> = {
    common: { label: 'Common', color: '#c9cdd2', frame: ['#d4d8dc', '#7d838a'], glow: null },
    uncommon: { label: 'Uncommon', color: '#7fe0b0', frame: ['#8be6bb', '#257f54'], glow: 0x7fe0b0 },
    rare: { label: 'Rare', color: '#8fb8ff', frame: ['#a3c4ff', '#2a5bbd'], glow: 0x6ea0ff },
    epic: { label: 'Epic', color: '#f48bc4', frame: ['#f792c9', '#8a1c58'], glow: 0xf06eb4 },
    legendary: { label: 'Legendary', color: '#ffe08a', frame: ['#fff2b8', '#e7b54a', '#9c5f18'], glow: 0xffd66e }
};

export interface ElementStyle
{
    badge: string;
    /** Art background radial gradient: center, edge. */
    art: [string, string];
    /** 24x24 SVG path data for the icon; `stroke` icons are outlined instead of filled. */
    icon: { d: string; stroke?: boolean }[];
}

export const ELEMENT_STYLE: Record<Element, ElementStyle> = {
    earth: { badge: '#b9862f', art: ['#f6dda8', '#7a5726'], icon: [{ d: 'M2 20l7-12 4 6 3-4 6 10z' }] },
    fire: { badge: '#d2452f', art: ['#ffd08e', '#8a2914'], icon: [{ d: 'M12 2c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3-1-5 1-7z' }] },
    water: { badge: '#1f8fa0', art: ['#aef1ea', '#11566a'], icon: [{ d: 'M12 2C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-12z' }] },
    wind: { badge: '#4b86c9', art: ['#dcf2ff', '#2a5a88'], icon: [{ d: 'M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7', stroke: true }] },
    forest: { badge: '#3c8f45', art: ['#cdf0b6', '#2c5728'], icon: [{ d: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15z' }] }
};

export const PALETTE = {
    bg: '#170e10',
    panel: '#1c1215',
    ink: '#f6eadc',
    muted: '#bba595',
    gold: '#e7b54a',
    backRed: '#7d1a1a'
};
