-- Trade push notifications ("asha sent you a trade offer", "ben accepted your trade"), on by default
-- for players who turned notifications on; switched off from their profile (PUT /me/notifications).

-- +goose Up
ALTER TABLE users ADD COLUMN notify_trades boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE users DROP COLUMN notify_trades;
