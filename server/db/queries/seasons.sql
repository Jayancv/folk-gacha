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

-- name: LockSeasonForPoints :one
-- Share-locks the season row before adding points. Finalizing takes FOR UPDATE on
-- the same row, so a freeze either waits for these points to commit, or has
-- already committed and finalized_at is set (READ COMMITTED re-reads the row).
SELECT finalized_at FROM seasons WHERE id = $1 FOR KEY SHARE;

-- name: AddSeasonPoints :exec
-- updated_at is when the player last scored: ties go to whoever got there first.
INSERT INTO season_points (season_id, user_id, points, updated_at)
VALUES (@season_id, @user_id, @points, @scored_at)
ON CONFLICT (season_id, user_id) DO UPDATE
SET points = season_points.points + EXCLUDED.points, updated_at = EXCLUDED.updated_at;

-- name: GetSeasonPoints :one
SELECT points FROM season_points WHERE season_id = $1 AND user_id = $2;
