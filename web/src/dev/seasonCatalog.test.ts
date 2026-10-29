import { describe, expect, it } from 'vitest';
import { RARITIES } from '../game/cards/model';
import { SPIRIT_GLYPHS } from '../game/cards/spiritArt';
import { EFFECT_IDS, PATTERN_IDS } from '../game/cards/traitArt';
import { buildCatalog, subtitle, type CatalogFile, type CatalogRow } from './seasonCatalog';

const cfg = {
    spirits: [{ id: 'malu', name: 'Malu Sprite', nameSi: 'මාළු', element: 'water', rarity: 'common', lore: 'Lives in ponds.' }],
    palettes: [{ id: 'jade', name: 'Jade', colors: ['#1f6f55', '#bfe8d6'], weight: 1 }],
    stamps: [{ id: 'none', name: '', weight: 1, scoreMult: 1 }, { id: 'lotus-seal', name: 'Lotus seal', weight: 1, scoreMult: 1.08 }]
};

function row (over: Partial<CatalogRow> = {}, traits: Partial<CatalogRow['traits']> = {}): CatalogRow
{
    return {
        id: 's1-0001', setNo: 1, template: 'malu', rarity: 'common', element: 'water',
        name: 'Softly Misty Malu Sprite of Galle', title: 'Malu Sprite', epithet: 'Softly Misty', nameSi: 'මාළු',
        traits: {
            prefix: 'misty', intensity: 2, adverb: 'Softly', suffix: 'of-galle', pattern: 'liyawala', palette: 'jade',
            stamp: 'lotus-seal', foil: 'none', visual: { tint: '#e3eef0', effect: 'mist' }, ...traits
        },
        score: 13, dropWeight: 0.01, maxCopies: null, artSeed: 42,
        ...over
    };
}

const file = (...cards: CatalogRow[]): CatalogFile => ({ id: 's1', cardCount: 1500, cards });

describe('subtitle', () =>
{
    it('is the name around the spirit title', () =>
    {
        expect(subtitle('Brightly Moonlit Gaja Calf of Kandy', 'Gaja Calf')).toBe('Brightly Moonlit · of Kandy');
        expect(subtitle('Moonlit Gaja Calf', 'Gaja Calf')).toBe('Moonlit');
        expect(subtitle('Gaja Calf the Dreamer', 'Gaja Calf')).toBe('the Dreamer');
        expect(subtitle('Makara', 'Makara')).toBe('');
    });
});

describe('buildCatalog', () =>
{
    it('resolves trait ids to colours, labels and lore', () =>
    {
        const [e] = buildCatalog(file(row()), cfg).entries;
        expect(e.lore).toBe('Lives in ponds.');
        expect(e.season).toMatchObject({
            seasonCardId: 's1-0001', setNo: 1, setSize: 1500, title: 'Malu Sprite', subtitle: 'Softly Misty · of Galle'
        });
        expect(e.season.art).toEqual({
            pattern: 'liyawala', palette: ['#1f6f55', '#bfe8d6'], tint: '#e3eef0', effect: 'mist',
            accessory: undefined, texture: undefined, intensity: 2,
            stamp: { id: 'lotus-seal', label: 'Lotus seal' }, foil: 'none', seed: 42
        });
    });

    it('treats the "none" stamp as no stamp and normalises foil and intensity', () =>
    {
        const [e] = buildCatalog(file(row({}, { stamp: 'none', foil: 'sparkly', intensity: 7 })), cfg).entries;
        expect(e.season.art.stamp).toBeUndefined();
        expect(e.season.art.foil).toBe('none');
        expect(e.season.art.intensity).toBe(3);
    });

    it('rejects unknown palettes instead of drawing a broken card', () =>
    {
        expect(() => buildCatalog(file(row({}, { palette: 'neon' })), cfg)).toThrow(/unknown palette neon/);
    });

    it('indexes entries by catalog id', () =>
    {
        const catalog = buildCatalog(file(row(), row({ id: 's1-0002', setNo: 2 })), cfg);
        expect(catalog.byId.get('s1-0002')?.season.setNo).toBe(2);
    });
});

// Guards against the generator config and the client art drifting apart.
describe('Season 1 catalog (server/seasons/s1)', async () =>
{
    // Untyped path: TypeScript would otherwise type-check the whole 1 MB file.
    const path = '../../../server/seasons/s1/cards.json';
    const raw = (await import(/* @vite-ignore */ path)).default as CatalogFile;
    const catalog = buildCatalog(raw);

    it('loads every card', () =>
    {
        expect(catalog.entries).toHaveLength(raw.cardCount);
        expect(new Set(catalog.entries.map(e => e.season.setNo)).size).toBe(raw.cardCount);
    });

    it('has every rarity', () =>
    {
        for (const r of RARITIES)
        {
            expect(catalog.entries.some(e => e.rarity === r)).toBe(true);
        }
    });

    it('only uses spirits, patterns and effects the client can draw', () =>
    {
        const unknown = catalog.entries.flatMap(e => [
            SPIRIT_GLYPHS[e.templateId] ? null : `spirit ${e.templateId}`,
            PATTERN_IDS.includes(e.season.art.pattern) ? null : `pattern ${e.season.art.pattern}`,
            !e.season.art.effect || EFFECT_IDS.includes(e.season.art.effect) ? null : `effect ${e.season.art.effect}`
        ]).filter(Boolean);
        expect([...new Set(unknown)]).toEqual([]);
    });

    it('gives every card lore and a level-1 score', () =>
    {
        expect(catalog.entries.every(e => e.lore.length > 0 && e.score > 0)).toBe(true);
    });
});
