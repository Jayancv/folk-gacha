-- Owned cards and daily pack claims.

-- +goose Up
-- One row per owned copy of a season card. copy_no is the copy's serial within
-- its season card (1 = first ever pulled), taken from season_cards.minted.
CREATE TABLE cards (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    season_card_id  text NOT NULL REFERENCES season_cards(id),
    copy_no         integer NOT NULL,
    owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level           smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
    acquired_via    text NOT NULL CHECK (acquired_via IN ('pack', 'merge', 'trade')),
    acquired_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (season_card_id, copy_no)
);

CREATE INDEX cards_owner_idx ON cards (owner_id);

-- One row per claimed daily pack. The primary key is what stops a second claim
-- on the same UTC day, even from two requests at once.
CREATE TABLE daily_claims (
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day             date NOT NULL,      -- UTC calendar day
    card_season_id  text NOT NULL REFERENCES card_seasons(id),
    -- Packs in a row without a Rare or better, counting this one (0 = this pack had one).
    pity_counter    integer NOT NULL CHECK (pity_counter >= 0),
    claimed_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);

-- +goose Down
DROP TABLE daily_claims;
DROP TABLE cards;
