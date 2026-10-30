-- The player's full name from their sign-in provider (e.g. Google), shown only to them.

-- +goose Up
-- Empty = none (dev logins, or accounts that haven't signed in with Google since this was added).
ALTER TABLE users ADD COLUMN display_name text NOT NULL DEFAULT ''
    CHECK (char_length(display_name) <= 60);

-- +goose Down
ALTER TABLE users DROP COLUMN display_name;
