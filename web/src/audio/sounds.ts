// Every game sound as plain data (no Web Audio here, so it's testable): a list of
// tones and noise bursts with envelopes. sfx.ts turns them into sound.
// Tune them here. To use a recorded sound instead, swap it in sfx.ts behind the same name.
//
// Notes come from one D-major pentatonic scale, so sounds that overlap (dealing five
// cards, "Reveal all") stay in tune with each other.

import type { Rarity } from '../game/cards/model';

export type SoundName =
    | 'deal' // a card slides onto the table
    | 'flip' // a card turns over
    | 'pickup' // a card is lifted on the merge board
    | 'reveal' // the face shows (by rarity: a tick for Common up to a fanfare for Legendary)
    | 'levelUp' // a merge made a card one level higher
    | 'recipe' // a merge made a new spirit
    | 'discover' // …and it was a recipe the player hadn't found before
    | 'mergeFail'; // the cards don't merge

export interface Tone
{
    /** Oscillator shape, or 'noise' for a burst of filtered noise (swishes, clicks). */
    wave: OscillatorType | 'noise';
    /** Start frequency in Hz (for noise: the filter's centre). */
    freq: number;
    /** Glide to this frequency by the end. */
    freqEnd?: number;
    /** Seconds after the sound starts. */
    at: number;
    /** Seconds, including the fade out. */
    duration: number;
    /** Peak volume, 0–1 (before the master volume). */
    gain: number;
    /** Fade-in seconds (default a few ms, to avoid clicks). */
    attack?: number;
    /** Filter quality for noise (higher = more pitched). */
    q?: number;
}

export type Sound = Tone[];

// D major pentatonic, by octave: D E F# A B.
const D4 = 293.66, E4 = 329.63, FS4 = 369.99, A4 = 440, B4 = 493.88;
const D5 = D4 * 2, E5 = E4 * 2, FS5 = FS4 * 2, A5 = A4 * 2, B5 = B4 * 2;
const D6 = D4 * 4, FS6 = FS4 * 4, A6 = A4 * 4, D7 = D4 * 8;

/** Notes one after another. */
function arpeggio (notes: number[], start: number, step: number, duration: number, gain: number, wave: OscillatorType = 'triangle'): Tone[]
{
    return notes.map((freq, i) => ({ wave, freq, at: start + i * step, duration, gain }));
}

const REVEAL: Record<Rarity, Sound> = {
    common: [
        { wave: 'noise', freq: 4200, at: 0, duration: 0.04, gain: 0.18, q: 2 },
        { wave: 'sine', freq: D6, at: 0, duration: 0.12, gain: 0.12 }
    ],
    uncommon: [
        { wave: 'noise', freq: 4200, at: 0, duration: 0.04, gain: 0.18, q: 2 },
        ...arpeggio([A5, D6], 0, 0.07, 0.35, 0.16)
    ],
    rare: [
        { wave: 'noise', freq: 3600, at: 0, duration: 0.06, gain: 0.2, q: 1.5 },
        ...arpeggio([D5, FS5, A5, D6], 0, 0.065, 0.55, 0.15),
        { wave: 'sine', freq: FS6, at: 0.26, duration: 0.7, gain: 0.07 }
    ],
    epic: [
        { wave: 'sine', freq: 147, freqEnd: 98, at: 0, duration: 0.45, gain: 0.32 },
        { wave: 'noise', freq: 2400, freqEnd: 6000, at: 0, duration: 0.35, gain: 0.16, q: 0.8 },
        ...arpeggio([D5, FS5, A5, D6, FS6, A6], 0.02, 0.06, 0.6, 0.13),
        // Held chord under the sparkle.
        { wave: 'triangle', freq: D5, at: 0.05, duration: 1.1, gain: 0.08, attack: 0.08 },
        { wave: 'triangle', freq: FS5, at: 0.05, duration: 1.1, gain: 0.07, attack: 0.08 },
        { wave: 'triangle', freq: A5, at: 0.05, duration: 1.1, gain: 0.07, attack: 0.08 }
    ],
    legendary: [
        { wave: 'sine', freq: 98, freqEnd: 41, at: 0, duration: 0.8, gain: 0.45 },
        { wave: 'noise', freq: 1200, freqEnd: 7000, at: 0, duration: 0.6, gain: 0.2, q: 0.7 },
        ...arpeggio([D5, E5, FS5, A5, B5, D6, FS6, A6], 0.04, 0.055, 0.7, 0.13),
        // A bright held chord, then a high shimmer that fades out slowly.
        ...[D4, A4, D5, FS5, A5].map((freq): Tone => ({ wave: 'triangle', freq, at: 0.08, duration: 1.9, gain: 0.07, attack: 0.12 })),
        ...arpeggio([D7, A6, D7, FS6, D7], 0.55, 0.11, 0.5, 0.05, 'sine')
    ]
};

const SOUNDS: Record<Exclude<SoundName, 'reveal'>, Sound> = {
    deal: [{ wave: 'noise', freq: 1800, freqEnd: 900, at: 0, duration: 0.13, gain: 0.12, q: 1.2 }],
    flip: [
        { wave: 'noise', freq: 3200, freqEnd: 1300, at: 0, duration: 0.09, gain: 0.2, q: 1.4 },
        { wave: 'sine', freq: 520, freqEnd: 760, at: 0, duration: 0.06, gain: 0.05 }
    ],
    pickup: [{ wave: 'sine', freq: A5, freqEnd: D6, at: 0, duration: 0.07, gain: 0.08 }],
    levelUp: [
        { wave: 'noise', freq: 2000, freqEnd: 5000, at: 0, duration: 0.18, gain: 0.14, q: 1 },
        ...arpeggio([A5, D6, FS6], 0, 0.08, 0.4, 0.15),
        { wave: 'sine', freq: A6, at: 0.24, duration: 0.6, gain: 0.06 }
    ],
    recipe: [
        { wave: 'sine', freq: 196, freqEnd: 131, at: 0, duration: 0.35, gain: 0.22 },
        ...arpeggio([D5, FS5, A5, D6, FS6], 0, 0.06, 0.55, 0.13),
        { wave: 'triangle', freq: D5, at: 0.05, duration: 0.9, gain: 0.07, attack: 0.06 },
        { wave: 'triangle', freq: A5, at: 0.05, duration: 0.9, gain: 0.06, attack: 0.06 }
    ],
    discover: [
        { wave: 'sine', freq: 147, freqEnd: 98, at: 0, duration: 0.5, gain: 0.28 },
        { wave: 'noise', freq: 1500, freqEnd: 6500, at: 0, duration: 0.45, gain: 0.16, q: 0.8 },
        ...arpeggio([D5, E5, FS5, A5, B5, D6, FS6, A6], 0, 0.05, 0.6, 0.12),
        ...arpeggio([D7, A6, D7], 0.5, 0.12, 0.5, 0.05, 'sine'),
        { wave: 'triangle', freq: D5, at: 0.1, duration: 1.4, gain: 0.07, attack: 0.1 },
        { wave: 'triangle', freq: FS5, at: 0.1, duration: 1.4, gain: 0.06, attack: 0.1 }
    ],
    mergeFail: [
        { wave: 'sine', freq: 170, freqEnd: 110, at: 0, duration: 0.22, gain: 0.25 },
        { wave: 'noise', freq: 400, at: 0, duration: 0.08, gain: 0.12, q: 1 }
    ]
};

/** The tones for a sound; reveals depend on the card's rarity. */
export function soundFor (name: SoundName, rarity: Rarity = 'common'): Sound
{
    return name === 'reveal' ? REVEAL[rarity] : SOUNDS[name];
}

/** Rising build-up while a Rare-or-better card trembles before its flip (CardView.anticipate). */
export function anticipationSound (seconds: number, rarity: Rarity): Sound
{
    const strength = { common: 0, uncommon: 0, rare: 0.6, epic: 0.8, legendary: 1 }[rarity];
    if (seconds <= 0 || strength === 0)
    {
        return [];
    }
    return [
        { wave: 'noise', freq: 600, freqEnd: 5000, at: 0, duration: seconds, gain: 0.12 * strength, attack: seconds * 0.8, q: 0.9 },
        { wave: 'sine', freq: D4, freqEnd: D5 * (1 + strength), at: 0, duration: seconds, gain: 0.1 * strength, attack: seconds * 0.7 }
    ];
}

/** The merge "charge" hum while waiting for the server: rises from `from` to `to` Hz over `seconds`, then holds. */
export const CHARGE = { from: 110, to: 440, seconds: 1.6, gain: 0.09, tremoloHz: 9 };

/** When the last tone of a sound ends, in seconds. */
export function soundLength (sound: Sound): number
{
    return sound.reduce((end, t) => Math.max(end, t.at + t.duration), 0);
}
