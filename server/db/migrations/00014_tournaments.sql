-- Tournaments: players enter a lineup of their cards; the lineup is scored by the
-- tournament's format when entries close (rules: internal/game/tournaments.go).

-- +goose Up
-- One tournament of a series (server/rules/tournaments.yaml), created when its period starts.
CREATE TABLE tournaments (
    id         text PRIMARY KEY,            -- series + period: 'daily-2026-11-03', 'weekly-2026-W45'
    series     text NOT NULL,
    n          integer NOT NULL,            -- the series' period number (format rotation)
    name       text NOT NULL,               -- series name when it opened
    format     jsonb NOT NULL,              -- the format as it was when it opened (the file may change later)
    element    text,                        -- element trials only
    opens_at   timestamptz NOT NULL,
    closes_at  timestamptz NOT NULL,        -- entries close; lineups scored
    ends_at    timestamptz NOT NULL,        -- cards free again
    -- open → locked (scored, results show) → finished (cards unlocked)
    status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'finished')),
    -- Ties are broken by this seed; only its SHA-256 is shown until entries close.
    seed       bytea NOT NULL,
    seed_hash  text NOT NULL,
    UNIQUE (series, n),
    CHECK (opens_at < closes_at AND closes_at < ends_at)
);

CREATE INDEX tournaments_unfinished_idx ON tournaments (closes_at) WHERE status <> 'finished';
CREATE INDEX tournaments_series_idx ON tournaments (series, opens_at DESC);

-- A player's entry. score, rank and breakdown are set when entries close.
CREATE TABLE tournament_entries (
    tournament_id  text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entered_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL,
    score          integer,
    rank           integer,
    breakdown      jsonb,
    PRIMARY KEY (tournament_id, user_id)
);

CREATE INDEX tournament_entries_rank_idx ON tournament_entries (tournament_id, rank) WHERE rank IS NOT NULL;
CREATE INDEX tournament_entries_user_idx ON tournament_entries (user_id);

-- The lineup. No foreign key to cards: results outlive cards merged after the tournament.
CREATE TABLE tournament_entry_cards (
    tournament_id  text NOT NULL,
    user_id        uuid NOT NULL,
    slot           smallint NOT NULL,       -- order the cards were picked in
    card_id        uuid NOT NULL,
    snapshot       jsonb,                   -- the card as scored (set when entries close)
    PRIMARY KEY (tournament_id, user_id, slot),
    UNIQUE (tournament_id, card_id),
    FOREIGN KEY (tournament_id, user_id) REFERENCES tournament_entries ON DELETE CASCADE
);

CREATE INDEX tournament_entry_cards_card_idx ON tournament_entry_cards (card_id);

-- An entered card is locked until the tournament ends: no merging, trading or other tournaments.
ALTER TABLE cards ADD COLUMN locked_in_tournament_id text REFERENCES tournaments(id) ON DELETE SET NULL;
CREATE INDEX cards_locked_in_tournament_idx ON cards (locked_in_tournament_id) WHERE locked_in_tournament_id IS NOT NULL;

-- +goose Down
ALTER TABLE cards DROP COLUMN locked_in_tournament_id;
DROP TABLE tournament_entry_cards;
DROP TABLE tournament_entries;
DROP TABLE tournaments;
