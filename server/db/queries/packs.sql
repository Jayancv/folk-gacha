-- name: LockUser :one
-- Serializes one player's claims (and later merges) without blocking anyone else.
SELECT id FROM users WHERE id = $1 FOR UPDATE;

-- name: CurrentCardSeason :one
-- The card season packs draw from at @at. A season without dates is always open.
SELECT id, card_count FROM card_seasons
WHERE (starts_at IS NULL OR starts_at <= @at::timestamptz)
  AND (ends_at IS NULL OR ends_at > @at::timestamptz)
ORDER BY starts_at DESC NULLS LAST, id DESC
LIMIT 1;

-- name: HasClaimedDay :one
SELECT EXISTS (SELECT 1 FROM daily_claims WHERE user_id = $1 AND day = $2);

-- name: LastPityCounter :one
-- Pity counter of the player's latest pack (no rows = never claimed).
SELECT pity_counter FROM daily_claims WHERE user_id = $1 ORDER BY day DESC LIMIT 1;

-- name: InsertDailyClaim :exec
INSERT INTO daily_claims (user_id, day, card_season_id, pity_counter)
VALUES ($1, $2, $3, $4);

-- name: ListPullableCards :many
-- Every card of the season that still has copies left; only one spirit's when
-- @template_id is set (recipe outputs).
SELECT id, rarity, drop_weight, max_copies, minted, score FROM season_cards
WHERE card_season_id = @card_season_id
  AND (sqlc.narg(template_id)::text IS NULL OR template_id = sqlc.narg(template_id))
  AND (max_copies IS NULL OR minted < max_copies)
ORDER BY id;

-- name: MintSeasonCard :one
-- Takes @count copies of a season card. No row means it sold out meanwhile.
UPDATE season_cards SET minted = minted + @count::integer
WHERE id = @id AND (max_copies IS NULL OR minted + @count::integer <= max_copies)
RETURNING minted;

-- name: CreateCard :one
INSERT INTO cards (season_card_id, copy_no, owner_id, level, acquired_via)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: GetOwnedCards :many
-- Cards with everything the client needs to draw them.
SELECT c.id, c.season_card_id, c.copy_no, c.owner_id, c.level, c.acquired_via, c.acquired_at,
       sc.card_season_id, sc.set_no, sc.template_id, sc.rarity, sc.name, sc.title, sc.epithet,
       sc.traits, sc.score, sc.max_copies, sc.art_seed,
       cs.card_count AS set_size,
       t.name_si, t.element, t.lore
FROM cards c
JOIN season_cards sc ON sc.id = c.season_card_id
JOIN card_seasons cs ON cs.id = sc.card_season_id
JOIN card_templates t ON t.id = sc.template_id
WHERE c.id = ANY(@ids::uuid[]);
