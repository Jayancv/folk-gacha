-- name: UpsertPushSubscription :exec
-- Saving the same browser again (new keys, or another player signed in on it) replaces it.
INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
VALUES ($1, $2, $3, $4)
ON CONFLICT (endpoint) DO UPDATE
SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, failures = 0;

-- name: DeletePushSubscription :execrows
-- Only the player's own subscription.
DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2;

-- name: ClaimPushRun :execrows
-- 1 row: this server sends today's pushes. 0: another server (or an earlier run) already did.
-- A run that never finished (error, crash) is taken over once it's 15 minutes old, so a
-- bad moment doesn't cost the day's notification.
INSERT INTO push_runs (day) VALUES ($1)
ON CONFLICT (day) DO UPDATE SET started_at = now()
WHERE push_runs.finished_at IS NULL AND push_runs.started_at < now() - interval '15 minutes';

-- name: FinishPushRun :exec
UPDATE push_runs SET sent = $2, finished_at = now() WHERE day = $1;

-- name: ListPackReadySubscriptions :many
-- Every subscription of a player who hasn't claimed @day's pack yet.
SELECT s.endpoint, s.p256dh, s.auth
FROM push_subscriptions s
WHERE NOT EXISTS (SELECT 1 FROM daily_claims c WHERE c.user_id = s.user_id AND c.day = @day)
ORDER BY s.endpoint;

-- name: DropPushSubscription :exec
-- The push service says this browser is gone (unsubscribed, app uninstalled).
DELETE FROM push_subscriptions WHERE endpoint = $1;

-- name: RecordPushFailure :one
UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = $1 RETURNING failures;

-- name: RecordPushSuccess :exec
UPDATE push_subscriptions SET failures = 0 WHERE endpoint = $1 AND failures > 0;
