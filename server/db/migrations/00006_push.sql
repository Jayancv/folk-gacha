-- Web push: each player's browser subscriptions, and which daily "pack ready" sends ran.

-- +goose Up
-- One row per browser/device that allowed notifications. The endpoint is the push
-- service URL for that browser; p256dh and auth are its encryption keys.
CREATE TABLE push_subscriptions (
    endpoint     text PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh       text NOT NULL,
    auth         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    -- Failed sends in a row (network or push-service errors); the subscription is dropped after a few.
    failures     integer NOT NULL DEFAULT 0
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- One row per UTC day whose "your pack is ready" push was sent. Inserting it is how one
-- server (of several, or after a restart) claims the day's send.
CREATE TABLE push_runs (
    day         date PRIMARY KEY,
    started_at  timestamptz NOT NULL DEFAULT now(),
    sent        integer,
    finished_at timestamptz
);

-- +goose Down
DROP TABLE push_runs;
DROP TABLE push_subscriptions;
