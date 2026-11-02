-- Partner gifts: the first accepted trade between two players gives each of them one
-- card (game.PartnerGiftsPerWeek per player per week).

-- +goose Up
-- Pairs of players who have traded, stored once with user_a < user_b.
CREATE TABLE trade_partners (
    user_a          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_trade_id  uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)
);

-- Gifts per player per weekly season (game.GiftWeek); a conditional upsert keeps the
-- cap exact when trades are accepted at once.
CREATE TABLE trade_gift_weeks (
    user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week     text NOT NULL,
    gifts    smallint NOT NULL,
    PRIMARY KEY (user_id, week)
);

-- The gift card each player got for a trade. No foreign key to cards: it can be merged away.
CREATE TABLE trade_gifts (
    trade_id  uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id   uuid NOT NULL,
    PRIMARY KEY (trade_id, user_id)
);

ALTER TABLE cards DROP CONSTRAINT cards_acquired_via_check;
ALTER TABLE cards ADD CONSTRAINT cards_acquired_via_check
    CHECK (acquired_via IN ('pack', 'merge', 'trade', 'gift'));

-- +goose Down
DELETE FROM cards WHERE acquired_via = 'gift';
ALTER TABLE cards DROP CONSTRAINT cards_acquired_via_check;
ALTER TABLE cards ADD CONSTRAINT cards_acquired_via_check
    CHECK (acquired_via IN ('pack', 'merge', 'trade'));
DROP TABLE trade_gifts;
DROP TABLE trade_gift_weeks;
DROP TABLE trade_partners;
