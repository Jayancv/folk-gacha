-- First-time tutorial: when the player finished (or skipped) it.

-- +goose Up
ALTER TABLE users ADD COLUMN tutorial_done_at timestamptz;
-- Players who have already opened a pack know the basics: don't walk them through it.
UPDATE users u SET tutorial_done_at = now() WHERE EXISTS (SELECT 1 FROM daily_claims c WHERE c.user_id = u.id);

-- +goose Down
ALTER TABLE users DROP COLUMN tutorial_done_at;
