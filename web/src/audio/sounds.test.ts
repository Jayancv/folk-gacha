import { describe, expect, it } from 'vitest';
import { RARITIES } from '../game/cards/model';
import { REVEAL_FX } from '../game/cards/revealFx';
import { anticipationSound, soundFor, soundLength, type Sound, type SoundName } from './sounds';

const NAMES: SoundName[] = ['deal', 'flip', 'pickup', 'reveal', 'levelUp', 'recipe', 'discover', 'mergeFail'];

function expectPlayable (sound: Sound)
{
    expect(sound.length).toBeGreaterThan(0);
    for (const t of sound)
    {
        expect(t.freq).toBeGreaterThanOrEqual(20);
        expect(t.freqEnd ?? t.freq).toBeLessThanOrEqual(16000);
        expect(t.duration).toBeGreaterThan(0);
        expect(t.at).toBeGreaterThanOrEqual(0);
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(0.5); // headroom: several sounds can overlap
        expect(t.attack ?? 0).toBeLessThan(t.duration);
    }
}

describe('game sounds', () =>
{
    it('are all playable', () =>
    {
        for (const name of NAMES)
        {
            for (const rarity of RARITIES)
            {
                expectPlayable(soundFor(name, rarity));
            }
        }
    });

    it('keep table sounds short so rapid taps never pile up', () =>
    {
        for (const name of ['deal', 'flip', 'pickup', 'mergeFail'] as const)
        {
            expect(soundLength(soundFor(name))).toBeLessThan(0.3);
        }
    });

    it('make rarer reveals bigger: longer and fuller', () =>
    {
        const sizes = RARITIES.map(r => ({ length: soundLength(soundFor('reveal', r)), tones: soundFor('reveal', r).length }));
        for (let i = 1; i < sizes.length; i++)
        {
            expect(sizes[i].length).toBeGreaterThan(sizes[i - 1].length);
            expect(sizes[i].tones).toBeGreaterThanOrEqual(sizes[i - 1].tones);
        }
        expect(soundLength(soundFor('reveal', 'legendary'))).toBeLessThan(3);
    });

    it('make a discovery bigger than a known recipe', () =>
    {
        expect(soundLength(soundFor('discover'))).toBeGreaterThan(soundLength(soundFor('recipe')));
    });

    it('build up exactly as long as the card trembles, for Rare and better only', () =>
    {
        for (const rarity of RARITIES)
        {
            const seconds = REVEAL_FX[rarity].anticipationMs / 1000;
            const sound = anticipationSound(seconds, rarity);
            if (seconds === 0)
            {
                expect(sound).toEqual([]);
                continue;
            }
            expectPlayable(sound);
            expect(soundLength(sound)).toBeCloseTo(seconds);
        }
    });
});
