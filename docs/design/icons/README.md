# Browser and app icons

A glowing gacha capsule resting on a lotus inside a gold Thorana (temple arch) with Makara scrolls, on lacquer red.
Two sources: a detailed version for app icons and a simplified version that stays crisp at browser-tab size.

| File | Use |
| --- | --- |
| `icon-detailed.svg` | Source for large icons (180 px and up) |
| `favicon.svg` | Simplified source for browser tabs (16–48 px) |
| `favicon.ico` | Older browsers (16, 32, 48 px inside) |
| `icon-16.png`, `icon-32.png` | Small PNG favicons |
| `apple-touch-icon.png` | iPhone/iPad home screen (180 px) |
| `icon-192.png`, `icon-512.png` | PWA manifest icons |
| `icon-preview.png` | Preview of all sizes |

## How to use (Phase 0)

After creating the web app, copy these files into `web/public/` and add to `web/index.html` inside `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#7d1a1a">
```

## PWA icons (Phase 3)

The installed-app icons are rendered from the logo emblem (`../logo/logo-emblem.svg`), matching
`web/public/apple-touch-icon.png`, by `make-pwa-icons.mjs` (headless Chrome; set `CHROME` if it isn't in the default place):

```
node docs/design/icons/make-pwa-icons.mjs
```

It writes `web/public/icons/icon-192.png`, `icon-512.png` (emblem on the dark table colour) and
`icon-maskable-512.png` (emblem inside the 80% safe zone, for Android's circle/squircle crops).
`web/public/manifest.webmanifest` lists them.
