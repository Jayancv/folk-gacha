-- name: GetUserByUsername :one
SELECT * FROM users WHERE lower(username) = lower($1);

-- name: GetProfileStats :one
-- Collection power is the sum of the player's best 10 card scores at their levels
-- (same rounding as game.LevelScore); podiums are weekly finishes in the top 3.
SELECT
    (SELECT count(*) FROM cards c WHERE c.owner_id = @user_id)::integer AS card_count,
    (SELECT coalesce(sum(best.score), 0) FROM (
        SELECT round(sc.score * power(2.2::numeric, c.level - 1)) AS score
        FROM cards c JOIN season_cards sc ON sc.id = c.season_card_id
        WHERE c.owner_id = @user_id
        ORDER BY 1 DESC
        LIMIT 10
    ) best)::integer AS collection_power,
    (SELECT count(*) FROM discovered_recipes d WHERE d.user_id = @user_id)::integer AS recipes,
    (SELECT count(*) FROM season_results r WHERE r.user_id = @user_id AND r.rank <= 3)::integer AS podiums;

-- name: ListShowcaseCardIDs :many
-- The chosen showcase, in order, skipping cards the player no longer owns.
SELECT s.card_id
FROM showcase_cards s
JOIN cards c ON c.id = s.card_id AND c.owner_id = s.user_id
WHERE s.user_id = $1
ORDER BY s.position;

-- name: ListBestCardIDs :many
-- The player's highest-scoring cards (the showcase until they pick their own).
SELECT c.id
FROM cards c JOIN season_cards sc ON sc.id = c.season_card_id
WHERE c.owner_id = @user_id
ORDER BY round(sc.score * power(2.2::numeric, c.level - 1)) DESC, c.acquired_at, c.id
LIMIT @limit_n;

-- name: CountOwnedCards :one
SELECT count(*) FROM cards WHERE owner_id = @user_id AND id = ANY(@ids::uuid[]);

-- name: ClearShowcase :exec
DELETE FROM showcase_cards WHERE user_id = $1;

-- name: AddShowcaseCard :exec
INSERT INTO showcase_cards (user_id, position, card_id) VALUES ($1, $2, $3);
