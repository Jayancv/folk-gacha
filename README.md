# Folk Gacha — Lanka Mythics

A mobile-first web card game about spirit creatures from Sri Lankan folklore. Claim a free pack every day, flip
the cards, merge them into stronger ones, trade with other players and climb the weekly leaderboard.
Works best on a phone, and installs to your home screen.

## How to play

1. **Claim** your daily pack: 5 face-down cards, free, resetting at 00:00 UTC.
2. **Flip** the cards one by one. Rarer cards glow, burst and sound brighter.
3. **Merge** on the Board: drag a card onto another.
   - Two cards of the same spirit and level → one card of the next level (up to level 5).
   - Some pairs of different spirits are hidden **recipes** that create a new creature
     (e.g. Gaja Calf + Simha Cub = Gajasinghe). Discoveries are kept in your recipe book.
4. **Trade** with other players: open their profile, pick cards from both sides and send an offer.
5. **Climb** the leaderboard: cards you pull or merge earn season points.

## Cards

Each card is a spirit (Gaja Calf, Monara Chick, Naga Raksha, Makara, …) with an element (Earth, Fire, Water, Wind,
Forest) and a mix of traits: name prefix and suffix, background pattern, palette, stamp and foil. Season 1 is a fixed
set of 1,500 unique cards.

| Rarity | Drop chance per card | Copy limit |
| --- | --- | --- |
| Common | 70% | — |
| Uncommon | 20% | — |
| Rare | 8% | — |
| Epic | 1.8% | 100 per card |
| Legendary | 0.2% | 25 per card |

At least one Rare or better is guaranteed every 7 daily packs.

## Trading

- Up to 5 cards on each side of an offer, 5 offers a day.
- Offers expire after 48 hours. A card can only be in one open offer at a time.
- The swap is all-or-nothing: if a card is gone (merged or traded away), the trade fails.
- Your first trade with a new partner gives both of you a **gift card** to open on the Pack tab (up to 2 a week).
- Offers arrive live while the app is open.

## Leaderboard

- Weekly seasons, Monday 00:00 UTC to Sunday 23:59 UTC, plus an **all-time** board.
- Points come from cards you pull or merge. Traded and gift cards earn none, so nobody can farm points with spare accounts.
- The top 3 each week get a cosmetic reward, never extra power.

## Fair play

The server decides everything: pack rolls, merge results, trades and scores. The browser only shows and animates
the results, and every merge and trade is a single database transaction.

## Coming next

Tournaments: enter a lineup of cards, scored by a different format each time (element trials, rarity caps,
underdog scoring, head-to-head brackets), so it's not always the biggest collection that wins.

## Tech

- **Web** (`web/`): React, TypeScript, Vite, Phaser 4 for the card table, Tailwind, TanStack Query; installable PWA
  with an offline shell and "your pack is ready" notifications.
- **Server** (`server/`): Go, PostgreSQL (pgx + sqlc, goose migrations), WebSockets for live trade events.
- **API contract** (`api/`): OpenAPI, generating both the Go handlers and the TypeScript types.
- Hosting: Netlify (web) and Render (server + Postgres).

## Running locally

Needs Docker Desktop, Go 1.25 and Node 22.

```sh
docker compose up -d                        # Postgres on port 55432
cd server
go run ./cmd/migrate up                     # create the tables
go run ./cmd/seed                           # load the card catalog and recipes
DEV_LOGIN=1 go run ./cmd/server             # API on http://localhost:8081
cd ../web
npm install
npm run dev-nolog                           # app on http://localhost:8080
```

Tests: `cd server && go test ./...` and `cd web && npm test`.
Gameplay tuning (drop chances, trade limits, gifts) lives in `server/rules/game.yaml`.
See `CLAUDE.md` for the full design, architecture and roadmap.
