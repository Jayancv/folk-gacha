-- name: ListOwnedCardIDs :many
-- One page of a player's collection, filtered and sorted, with the total that
-- match (before paging). Empty filter arrays / NULLs mean "any".
-- Sorts: newest (default), score (score at the card's level, as game.LevelScore),
-- number (card season, set number, highest level first). Ties: newest, then id.
SELECT c.id, count(*) OVER () AS total
FROM cards c
JOIN season_cards sc ON sc.id = c.season_card_id
JOIN card_templates t ON t.id = sc.template_id
WHERE c.owner_id = @owner_id
  AND (coalesce(cardinality(@rarities::text[]), 0) = 0 OR sc.rarity = ANY(@rarities::text[]))
  AND (coalesce(cardinality(@elements::text[]), 0) = 0 OR t.element = ANY(@elements::text[]))
  AND (sqlc.narg(level)::smallint IS NULL OR c.level = sqlc.narg(level)::smallint)
  AND (sqlc.narg(spirit)::text IS NULL OR sc.template_id = sqlc.narg(spirit)::text)
  AND (sqlc.narg(card_season)::text IS NULL OR sc.card_season_id = sqlc.narg(card_season)::text)
ORDER BY
  CASE WHEN @sort::text = 'score' THEN round(sc.score * power(2.2::numeric, c.level - 1)) END DESC,
  CASE WHEN @sort::text = 'number' THEN sc.card_season_id END,
  CASE WHEN @sort::text = 'number' THEN sc.set_no END,
  CASE WHEN @sort::text = 'number' THEN c.level END DESC,
  c.acquired_at DESC,
  c.id
LIMIT @page_limit OFFSET @page_offset;
