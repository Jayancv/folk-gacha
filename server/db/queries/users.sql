-- name: GetUserByAuthID :one
SELECT * FROM users WHERE auth_id = $1;

-- name: CreateUser :one
INSERT INTO users (auth_id, username)
VALUES ($1, $2)
RETURNING *;

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, expires_at)
VALUES ($1, $2, $3);

-- name: GetSessionUser :one
-- The user behind a live (unexpired) session.
SELECT u.*
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.expires_at > now();

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = $1;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions WHERE expires_at <= now();

-- name: SetDisplayName :one
-- Keeps the full name in step with the sign-in provider (it can change there).
UPDATE users SET display_name = $2 WHERE id = $1 RETURNING *;

-- name: CompleteTutorial :one
-- Records the first time only (finishing again or skipping later changes nothing).
UPDATE users SET tutorial_done_at = coalesce(tutorial_done_at, now()) WHERE id = $1 RETURNING *;
