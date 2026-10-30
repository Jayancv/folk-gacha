-- Live ranks use the same order as FreezeSeasonResults (points, then who got there
-- first, then id), so a week's live ranks and its frozen final ranks always agree.

-- name: ListLiveTop :many
-- The top @top_n players of a season still in progress, plus how many are ranked.
WITH ranked AS (
    SELECT user_id, points,
           row_number() OVER (ORDER BY points DESC, updated_at, user_id) AS rank,
           count(*) OVER () AS players
    FROM season_points
    WHERE season_id = @season_id AND points > 0
)
SELECT ranked.rank, ranked.points, ranked.user_id, u.username, ranked.players
FROM ranked
JOIN users u ON u.id = ranked.user_id
WHERE ranked.rank <= @top_n::bigint
ORDER BY ranked.rank;

-- name: GetLiveRank :one
-- One player's live rank (no row: no points this season yet).
WITH ranked AS (
    SELECT user_id, points,
           row_number() OVER (ORDER BY points DESC, updated_at, user_id) AS rank,
           count(*) OVER () AS players
    FROM season_points
    WHERE season_id = @season_id AND points > 0
)
SELECT ranked.rank, ranked.points, ranked.players
FROM ranked
JOIN users u ON u.id = ranked.user_id
WHERE u.id = @user_id;

-- name: ListFinalTop :many
-- The top @top_n of a frozen season, plus how many were ranked.
SELECT r.rank, r.points, r.user_id, u.username,
       (SELECT count(*) FROM season_results c WHERE c.season_id = r.season_id) AS players
FROM season_results r
JOIN users u ON u.id = r.user_id
WHERE r.season_id = @season_id AND r.rank <= @top_n::integer
ORDER BY r.rank;

-- name: GetFinalRank :one
SELECT r.rank, r.points,
       (SELECT count(*) FROM season_results c WHERE c.season_id = r.season_id) AS players
FROM season_results r
WHERE r.season_id = @season_id AND r.user_id = @user_id;
