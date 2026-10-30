import { describe, expect, it } from 'vitest';
import { toCardData, type ApiCard } from './cards';

const card: ApiCard = {
    id: '8a7c2a52-6a43-4cbe-9d0f-6f4c3c9a0001',
    seasonCardId: 's1-0042',
    cardSeasonId: 's1',
    setNo: 42,
    setSize: 1500,
    copyNo: 3,
    templateId: 'gaja-calf',
    name: 'Brightly Moonlit Gaja Calf of Kandy',
    title: 'Gaja Calf',
    epithet: 'Brightly Moonlit · of Kandy',
    nameSi: 'ඇත් පැටියා',
    element: 'earth',
    rarity: 'common',
    level: 2,
    score: 24,
    lore: 'Follows the Perahera drums.',
    traits: {
        prefix: 'moonlit', intensity: 2, adverb: 'brightly', suffix: 'kandy',
        pattern: 'thorana', palette: 'lacquer-red', stamp: 'season-1', foil: 'holo',
        visual: { effect: 'moonglow', tint: '#cfd8ff' }
    },
    artSeed: 55970522,
    acquiredVia: 'pack',
    acquiredAt: '2026-10-30T12:00:00Z'
};

describe('toCardData', () =>
{
    it('resolves trait ids with the season config', () =>
    {
        const c = toCardData(card);
        expect(c).toMatchObject({ id: card.id, level: 2, score: 24, copyNo: 3, acquiredVia: 'pack' });
        expect(c.season).toMatchObject({ seasonCardId: 's1-0042', setNo: 42, setSize: 1500, title: 'Gaja Calf', subtitle: 'Brightly Moonlit · of Kandy' });
        expect(c.season?.art).toMatchObject({
            pattern: 'thorana',
            palette: ['#7d1a1a', '#e7b54a'],
            effect: 'moonglow',
            tint: '#cfd8ff',
            intensity: 2,
            stamp: { id: 'season-1', label: 'Season 1' },
            foil: 'holo',
            seed: 55970522
        });
    });

    it('leaves out the stamp for "none"', () =>
    {
        expect(toCardData({ ...card, traits: { ...card.traits, stamp: 'none' } }).season?.art.stamp).toBeUndefined();
    });

    it('draws unknown seasons and palettes with the plain look instead of failing', () =>
    {
        expect(toCardData({ ...card, cardSeasonId: 's9' }).season).toBeUndefined();
        expect(toCardData({ ...card, traits: { ...card.traits, palette: 'nope' } }).season).toBeUndefined();
    });
});
