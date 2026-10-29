-- Players and their sign-in sessions.

-- +goose Up
CREATE TABLE users (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Identity from the sign-in provider, e.g. 'google:1098…' or 'dev:asha'. Never shown to players.
    auth_id            text NOT NULL UNIQUE,
    username           text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    -- New accounts can't trade for 7 days (stops throwaway accounts feeding a main).
    trade_unlocked_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
    CHECK (username ~ '^[a-z0-9_]{3,20}$')
);

-- Usernames are compared case-insensitively; they are stored lower-case already.
CREATE UNIQUE INDEX users_username_idx ON users (lower(username));

-- Opaque session tokens. Only the SHA-256 of the token is stored, so a database
-- leak can't be replayed as live sessions.
CREATE TABLE sessions (
    token_hash  bytea PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- +goose Down
DROP TABLE sessions;
DROP TABLE users;
