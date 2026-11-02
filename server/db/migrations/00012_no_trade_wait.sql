-- Trading is open to every account from the start (no 7-day wait). The column and
-- its checks stay, so a wait can come back by changing the default again.

-- +goose Up
ALTER TABLE users ALTER COLUMN trade_unlocked_at SET DEFAULT now();
UPDATE users SET trade_unlocked_at = created_at WHERE trade_unlocked_at > created_at;

-- +goose Down
ALTER TABLE users ALTER COLUMN trade_unlocked_at SET DEFAULT now() + interval '7 days';
