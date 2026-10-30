import { describe, expect, it } from 'vitest';
import config from '../../../../server/seasons/s1/config.json';
import { ART_STAGES, artKeysFor, parseArtKey, SPIRIT_ART, stageForLevel } from './spiritImages';

describe('spirit art', () =>
{
    it('is named after spirits that exist, with a known growth stage (a typo would leave the art unused)', () =>
    {
        const spirits = new Set(config.spirits.map(s => s.id));
        for (const key of Object.keys(SPIRIT_ART))
        {
            const { spirit, stage } = parseArtKey(key);
            expect(spirits.has(spirit), `src/assets/spirits/${key}.webp has no spirit "${spirit}" in the season config`).toBe(true);
            expect(ART_STAGES as readonly string[], `src/assets/spirits/${key}.webp: unknown stage "${stage}"`).toContain(stage);
        }
    });

    it('includes the Gaja Calf', () =>
    {
        expect(SPIRIT_ART['gaja-calf']).toMatch(/gaja-calf.*\.webp/);
    });
});

describe('growth stages', () =>
{
    it('grows from baby (level 1) to young (2–3) to adult (4–5)', () =>
    {
        expect([1, 2, 3, 4, 5].map(stageForLevel)).toEqual(['baby', 'young', 'young', 'adult', 'adult']);
    });

    it('tries the card\'s own stage first, then the nearest ones', () =>
    {
        expect(artKeysFor('hansa', 1)).toEqual(['hansa.baby', 'hansa.young', 'hansa']);
        expect(artKeysFor('hansa', 3)).toEqual(['hansa.young', 'hansa', 'hansa.baby']);
        expect(artKeysFor('gaja-calf', 5)).toEqual(['gaja-calf', 'gaja-calf.young', 'gaja-calf.baby']);
    });

    it('reads stage file names, keeping hyphens in spirit ids', () =>
    {
        expect(parseArtKey('gaja-calf')).toEqual({ spirit: 'gaja-calf', stage: 'adult' });
        expect(parseArtKey('naga-raksha.young')).toEqual({ spirit: 'naga-raksha', stage: 'young' });
    });
});
