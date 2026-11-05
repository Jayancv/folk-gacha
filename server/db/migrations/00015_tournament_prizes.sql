-- Tournament prizes: the top places win cards (series prizeCards in
-- server/rules/tournaments.yaml). Each prize card waits on the winner's Pack tab, like a
-- trade gift, and is rolled and minted when they open it (POST /gifts/open).

-- +goose Up
-- Cards per place from 1st down, as the series had it when the tournament opened.
ALTER TABLE tournaments ADD COLUMN prizes integer[] NOT NULL DEFAULT '{}';

-- One row per prize card. No foreign key to cards: the card can be merged away.
CREATE TABLE tournament_prizes (
    tournament_id  text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    n              smallint NOT NULL CHECK (n >= 1),       -- 1..cards won
    place          integer NOT NULL CHECK (place >= 1),
    created_at     timestamptz NOT NULL,
    card_id        uuid,
    opened_at      timestamptz,
    PRIMARY KEY (tournament_id, user_id, n),
    CHECK ((card_id IS NULL) = (opened_at IS NULL))
);

CREATE INDEX tournament_prizes_waiting_idx ON tournament_prizes (user_id, created_at) WHERE opened_at IS NULL;

ALTER TABLE cards DROP CONSTRAINT cards_acquired_via_check;
ALTER TABLE cards ADD CONSTRAINT cards_acquired_via_check
    CHECK (acquired_via IN ('pack', 'merge', 'trade', 'gift', 'prize'));

-- +goose Down
DELETE FROM cards WHERE acquired_via = 'prize';
ALTER TABLE cards DROP CONSTRAINT cards_acquired_via_check;
ALTER TABLE cards ADD CONSTRAINT cards_acquired_via_check
    CHECK (acquired_via IN ('pack', 'merge', 'trade', 'gift'));
DROP TABLE tournament_prizes;
ALTER TABLE tournaments DROP COLUMN prizes;
