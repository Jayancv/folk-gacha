// Imports a spirit's creature art (a PNG with a transparent background, e.g. from ChatGPT)
// into the game: trims the empty margin, frames it the same way as every other spirit,
// and writes a compact WebP to src/assets/spirits/<spirit-id>.webp. The card renderer
// picks it up automatically (game/cards/spiritImages.ts).
//
//   npm run art:import -- <file.png> <spirit-id>
//   npm run art:import -- "C:\Users\me\Downloads\Royal Baby Elephant.png" gaja-calf
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SIZE = 640; // output square, px: ~2x the creature's size on a card
const MARGIN = 0.04; // empty border around the creature, as a share of SIZE

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const [input, id] = process.argv.slice(2);
if (!input || !id)
{
    console.error('Usage: npm run art:import -- <file.png> <spirit-id>');
    process.exit(1);
}

// The spirit must exist in a season config, so a typo can't add art nobody uses.
const seasonsDir = join(web, '..', 'server', 'seasons');
const known = new Set(readdirSync(seasonsDir)
    .filter(d => statSync(join(seasonsDir, d)).isDirectory())
    .flatMap(d =>
    {
        try
        {
            return JSON.parse(readFileSync(join(seasonsDir, d, 'config.json'), 'utf8')).spirits.map(s => s.id);
        }
        catch
        {
            return [];
        }
    }));
if (!known.has(id))
{
    console.error(`Unknown spirit "${id}". Known: ${[...known].sort().join(', ')}`);
    process.exit(1);
}

const meta = await sharp(input).metadata();
if (!meta.hasAlpha)
{
    console.error('The image has no transparency. Ask for a transparent background (or remove it first).');
    process.exit(1);
}

// Trim the transparent margin, fit the creature into the square, then add the same border to every spirit.
const pad = Math.round(SIZE * MARGIN);
const inner = SIZE - 2 * pad;
const trimmed = await sharp(input).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 }).toBuffer();
const out = join(web, 'src', 'assets', 'spirits', `${id}.webp`);
const info = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 86, alphaQuality: 90, effort: 6 })
    .toFile(out);

console.log(`wrote src/assets/spirits/${id}.webp (${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB) from ${meta.width}x${meta.height}`);
