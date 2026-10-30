import { describe, expect, it } from 'vitest';
import config from '../../../../server/seasons/s1/config.json';
import { SPIRIT_ART } from './spiritImages';

describe('spirit art', () =>
{
    it('is named after spirits that exist (a typo would leave the art unused)', () =>
    {
        const spirits = new Set(config.spirits.map(s => s.id));
        for (const id of Object.keys(SPIRIT_ART))
        {
            expect(spirits.has(id), `src/assets/spirits/${id}.webp has no spirit "${id}" in the season config`).toBe(true);
        }
    });

    it('includes the Gaja Calf', () =>
    {
        expect(SPIRIT_ART['gaja-calf']).toMatch(/gaja-calf.*\.webp/);
    });
});
