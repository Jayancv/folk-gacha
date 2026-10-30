-- Weekly leaderboard seasons (not card seasons), points, and frozen final standings.

-- +goose Up
-- One row per ISO week, Monday 00:00 UTC to the next Monday (game.SeasonFor).
-- Rows are created on demand by whatever first needs the week.
CREATE TABLE seasons (
    id            text PRIMARY KEY,           -- ISO week, e.g. '2026-W44'
    starts_at     timestamptz NOT NULL UNIQUE,
    ends_at       timestamptz NOT NULL,
    -- Set when the rollover job froze the standings into season_results.
    finalized_at  timestamptz,
    CHECK (ends_at > starts_at)
);

-- Points each player earned in a season (pulls and merges; never trades).
CREATE TABLE season_points (
    season_id   text NOT NULL REFERENCES seasons(id),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points      integer NOT NULL DEFAULT 0 CHECK (points >= 0),
    -- When the player last scored: ties go to whoever reached the score first.
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (season_id, user_id)
);

CREATE INDEX season_points_rank_idx ON season_points (season_id, points DESC, updated_at);

-- Final standings of a finished season, frozen by the rollover job.
-- Ranks 1-3 earn that week's cosmetic reward.
CREATE TABLE season_results (
    season_id  text NOT NULL REFERENCES seasons(id),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank       integer NOT NULL CHECK (rank >= 1),
    points     integer NOT NULL,
    PRIMARY KEY (season_id, user_id),
    UNIQUE (season_id, rank)
);

-- +goose Down
DROP TABLE season_results;
DROP TABLE season_points;
DROP TABLE seasons;
