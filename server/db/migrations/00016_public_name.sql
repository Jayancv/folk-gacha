-- The name a player chooses to show other players (leaderboards, tournament results, profiles).
-- users.display_name, from Google, stays private; until a player picks one, the username shows.

-- +goose Up
-- Empty = not chosen. Cleaned and checked by profile.CleanPublicName (2–20 characters).
ALTER TABLE users ADD COLUMN public_name text NOT NULL DEFAULT ''
    CHECK (char_length(public_name) <= 40);

-- +goose Down
ALTER TABLE users DROP COLUMN public_name;
