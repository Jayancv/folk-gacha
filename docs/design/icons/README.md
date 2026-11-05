# Browser and app icons

Three fanned cards (blue, purple, glowing gold) on a lacquer-red light burst, from the game logo
(`../logo/README.md`). Tab sizes use a simplified single card so they stay crisp at 16 px.

## App icons

All app icons come from the game logo's icon art (`../logo/game-icon.svg`, and `../logo/game-favicon.svg` for tab
sizes), rendered by `make-pwa-icons.mjs` (headless Chrome; set `CHROME` if it isn't in the default place):

```
node docs/design/icons/make-pwa-icons.mjs
```

It writes `web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (the cards already sit inside
Android's 80% safe zone), `web/public/apple-touch-icon.png`, `favicon-16.png`, `favicon-32.png`, `favicon.ico`
(16/32/48) and copies the full logo to `web/public/logo.svg` (sign-in screen).
