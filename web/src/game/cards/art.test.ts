import { describe, expect, it } from 'vitest';
import { darken, lighten, luminance, mix, rgba } from './color';
import { between, seededRandom } from './seededRandom';
import { makeCard, TEMPLATES } from '../../dev/fakePack';
import { CARD_H, CARD_W, faceLayout, SHINE } from './drawCard';
import { RARITIES, type CardData } from './model';
import { foilFrame } from './traitArt';

describe('seededRandom', () =>
{
    it('repeats the same sequence for the same seed (same card art on every device)', () =>
    {
        const a = seededRandom(55970522);
        const b = seededRandom(55970522);
        const seqA = Array.from({ length: 20 }, a);
        expect(Array.from({ length: 20 }, b)).toEqual(seqA);
    });

    it('differs between seeds', () =>
    {
        expect(seededRandom(1)()).not.toBe(seededRandom(2)());
    });

    it('stays in [0, 1) and handles seeds above 2^31', () =>
    {
        const rand = seededRandom(2316758487);
        for (let i = 0; i < 1000; i++)
        {
            const v = rand();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('between maps into the range', () =>
    {
        const rand = seededRandom(7);
        for (let i = 0; i < 100; i++)
        {
            const v = between(rand, 3, 5);
            expect(v).toBeGreaterThanOrEqual(3);
            expect(v).toBeLessThan(5);
        }
    });
});

describe('color', () =>
{
    it('mixes between two colours', () =>
    {
        expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
        expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
        expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
        expect(darken('#7d1a1a', 1)).toBe('#000000');
        expect(lighten('#7d1a1a', 1)).toBe('#ffffff');
    });

    it('accepts short hex and formats rgba', () =>
    {
        expect(rgba('#fff', 0.5)).toBe('rgba(255,255,255,0.5)');
    });

    it('tells pale palettes from dark ones', () =>
    {
        // drawCard switches to an element-coloured creature above 0.45.
        expect(luminance('#efe3cc')).toBeGreaterThan(0.45); // ivory
        expect(luminance('#141a33')).toBeLessThan(0.45);    // midnight
        expect(luminance('#7d1a1a')).toBeLessThan(0.45);    // lacquer red
    });

    it('throws on malformed colours', () =>
    {
        expect(() => mix('red', '#fff', 0.5)).toThrow(/bad colour/);
    });
});

describe('foilFrame', () =>
{
    it('replaces the rarity frame only for gold and holo', () =>
    {
        expect(foilFrame('none')).toBeNull();
        expect(foilFrame('gold')?.length).toBeGreaterThan(1);
        expect(foilFrame('holo')?.length).toBeGreaterThan(1);
    });
});

describe('faceLayout', () =>
{
    const plain = makeCard(TEMPLATES[0]);
    const withTraits: CardData = {
        ...plain,
        season: {
            seasonCardId: 's1-0001', setNo: 1, setSize: 1500, title: 'Gaja Calf', subtitle: 'Brightly Moonlit · of Kandy',
            art: { pattern: 'liyawala', palette: ['#1f6f55', '#bfe8d6'], intensity: 2, foil: 'none', seed: 1 }
        }
    };

    it('keeps the art window inside the card', () =>
    {
        for (const card of [plain, withTraits])
        {
            const { art } = faceLayout(card);
            expect(art.x).toBeGreaterThan(0);
            expect(art.y).toBeGreaterThan(0);
            expect(art.x + art.w).toBeLessThan(CARD_W);
            expect(art.y + art.h).toBeLessThan(CARD_H);
            expect(art.h).toBeGreaterThan(CARD_H * 0.45);
        }
    });

    it('makes room for the traits line by shortening the art, not moving the rows below', () =>
    {
        const a = faceLayout(plain);
        const b = faceLayout(withTraits);
        expect(a.subtitleTop).toBeNull();
        expect(b.subtitleTop).not.toBeNull();
        expect(b.art.y).toBeGreaterThan(a.art.y);
        expect(b.art.y + b.art.h).toBeCloseTo(a.art.y + a.art.h);
        expect(b.metaTop).toBe(a.metaTop);
    });
});

describe('SHINE', () =>
{
    it('rarer cards shine brighter and more often', () =>
    {
        for (let i = 1; i < RARITIES.length; i++)
        {
            const lo = SHINE[RARITIES[i - 1]];
            const hi = SHINE[RARITIES[i]];
            expect(hi.alpha).toBeGreaterThan(lo.alpha);
            expect(hi.every[1]).toBeLessThan(lo.every[1]);
            expect(hi.every[0]).toBeLessThanOrEqual(hi.every[1]);
        }
    });

    it('never fully whites out the pattern', () =>
    {
        expect(Math.max(...RARITIES.map(r => SHINE[r].alpha))).toBeLessThanOrEqual(1);
    });
});
