// Tiny colour helpers for card art (no Phaser). Colours are "#rrggbb" strings.

function parse (hex: string): [number, number, number]
{
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (full.length !== 6 || Number.isNaN(n))
    {
        throw new Error(`bad colour ${hex}`);
    }
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex (rgb: number[]): string
{
    return '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Linear blend: t = 0 gives a, t = 1 gives b. */
export function mix (a: string, b: string, t: number): string
{
    const ca = parse(a);
    const cb = parse(b);
    return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

export function rgba (hex: string, alpha: number): string
{
    const [r, g, b] = parse(hex);
    return `rgba(${r},${g},${b},${alpha})`;
}

/** Relative luminance 0..1 (sRGB, WCAG formula). */
export function luminance (hex: string): number
{
    const [r, g, b] = parse(hex).map(v =>
    {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function darken (hex: string, t: number): string
{
    return mix(hex, '#000000', t);
}

export function lighten (hex: string, t: number): string
{
    return mix(hex, '#ffffff', t);
}
