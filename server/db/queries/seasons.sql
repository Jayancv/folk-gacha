-- name: EnsureSeason :exec
-- Creates the season row if it doesn't exist yet (any caller, any number of times).
INSERT INTO seasons (id, starts_at, ends_at) VALUES ($1, $2, $3)
ON CONFLICT (id) DO NOTHING;

-- name: GetSeason :one
SELECT * FROM seasons WHERE id = $1;

-- name: ListSeasonsToFinalize :many
-- Ended seasons whose standings aren't frozen yet, oldest first.
SELECT id FROM seasons
WHERE finalized_at IS NULL AND ends_at <= @ended_before::timestamptz
ORDER BY starts_at;

-- name: LockSeasonToFinalize :one
-- Locks a not-yet-finalized season; no row means another server finalized it.
SELECT id FROM seasons WHERE id = $1 AND finalized_at IS NULL FOR UPDATE;

-- name: FreezeSeasonResults :execrows
-- Ranks by points, then by who got there first (earlier updated_at), then by id
-- so every rank is unique. Players with 0 points aren't ranked.
INSERT INTO season_results (season_id, user_id, rank, points)
SELECT sp.season_id, sp.user_id,
       row_number() OVER (ORDER BY sp.points DESC, sp.updated_at, sp.user_id),
       sp.points
FROM season_points sp
WHERE sp.season_id = $1 AND sp.points > 0;

-- name: MarkSeasonFinalized :exec
UPDATE seasons SET finalized_at = @finalized_at WHERE id = @id;

-- name: ListSeasonResults :many
SELECT r.rank, r.points, r.user_id, u.username
FROM season_results r
JOIN users u ON u.id = r.user_id
WHERE r.season_id = $1
ORDER BY r.rank
LIMIT $2;
