# Folk Gacha logo

## Game logo (current)

A game-style logo: the chunky arched wordmark "FOLK GACHA" (cream and gold-to-orange letters with a thick dark
outline) over three fanned cards (blue, purple and a glowing gold card on top, each with a lotus seal), a light burst
and sparkles, and a red ribbon reading "SPIRITS OF LANKA".

| File | Use |
| --- | --- |
| `game-logo.svg/.png` | Full logo, transparent: sign-in screen (`web/public/logo.svg`), title screen, store banners |
| `game-logo-dark.svg/.png` | Same on the table colour `#170e10` (social posts, previews) |
| `game-icon.svg/.png` | Square app icon (PWA, iPhone Home Screen) |
| `game-favicon.svg` | Simplified single card for browser tabs (16–48 px) |
| `game_logo.py` | Generator. Needs Python + `fonttools` and, in `./fonts` (or `FONTS=<dir>`), `LuckiestGuy-Regular.ttf` (Apache 2.0) and `LilitaOne-Regular.ttf` (OFL) from Google Fonts. Then run `node docs/design/icons/make-pwa-icons.mjs` to update the app's icons |

## Emblem (earlier, no longer used in the app)

A round emblem in traditional Sri Lankan decoration:

- **Outer ring:** pala pethi (lotus petal) border
- **Middle band:** a liyawala creeper scroll with leaves, spiral tendrils and small flowers
- **Center:** a full-bloom lotus (nelum mal) on a gold base, with a soft glow and sparkles
- **Wordmark:** "Folk Gacha" in Abhaya Libre (a typeface designed in Sri Lanka), with a liyawala divider and a lotus

Text is converted to outlines, so the SVGs look the same on every computer.

| File | Use |
| --- | --- |
| `logo-emblem.svg/.png` | Emblem only: splash screen, social avatar, loading screen |
| `logo-horizontal.svg/.png` | Emblem + name side by side, for light backgrounds (website header) |
| `logo-horizontal-dark.svg/.png` | Same, for dark backgrounds |
| `logo-stacked.svg/.png` | Emblem above name, for light backgrounds (title screen) |
| `logo-stacked-dark.svg/.png` | Same, on a dark background |
| `liyawala-border.svg/.png` | Repeating creeper strip for UI borders and dividers |
| `logo.py` | Generator script. Change the name or tagline in `wordmark()` and re-run (needs Python, `fonttools`, and the Abhaya Libre .ttf files from Google Fonts, OFL licence) |
