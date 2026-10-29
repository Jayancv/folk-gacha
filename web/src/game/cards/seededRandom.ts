// Deterministic random numbers for card art (no Phaser). The same seed gives the
// same sequence on every device, so a card's random details never change.

/** mulberry32: fast 32-bit PRNG, returns floats in [0, 1). */
export function seededRandom (seed: number): () => number
{
    let a = seed >>> 0;
    return () =>
    {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Float in [min, max). */
export function between (rand: () => number, min: number, max: number): number
{
    return min + rand() * (max - min);
}
