-- Trading: offers between two players, and the card flags trades need.

-- +goose Up
-- One offer: from_user gives the 'offer' cards and asks for the 'request' cards.
CREATE TABLE trades (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- open → accepted | declined | cancelled (by the sender) | expired | failed (a card was gone at accept)
    status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'accepted', 'declined', 'cancelled', 'expired', 'failed')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    resolved_at  timestamptz,
    CHECK (from_user <> to_user),
    CHECK ((status = 'open') = (resolved_at IS NULL))
);

CREATE INDEX trades_to_user_status_idx ON trades (to_user, status);
CREATE INDEX trades_from_user_created_idx ON trades (from_user, created_at);
CREATE INDEX trades_open_expiry_idx ON trades (expires_at) WHERE status = 'open';

-- The cards of an offer. No foreign key to cards: a requested card can be merged away
-- while the offer is open (the offer then fails), and history keeps the id.
CREATE TABLE trade_items (
    trade_id  uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    card_id   uuid NOT NULL,
    side      text NOT NULL CHECK (side IN ('offer', 'request')),
    position  smallint NOT NULL, -- order the cards were picked in, per side
    PRIMARY KEY (trade_id, card_id)
);

CREATE INDEX trade_items_card_idx ON trade_items (card_id);

-- An offered card is locked in its open offer: it can't be merged or offered again.
-- (Requested cards are not locked, or anyone could freeze another player's cards.)
ALTER TABLE cards ADD COLUMN locked_in_trade_id uuid REFERENCES trades(id) ON DELETE SET NULL;
CREATE INDEX cards_locked_in_trade_idx ON cards (locked_in_trade_id) WHERE locked_in_trade_id IS NOT NULL;

-- Came from a trade, or was merged from a card that did: earns no season points when
-- merged (stops alt accounts feeding a main). Survives merging.
ALTER TABLE cards ADD COLUMN traded boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE cards DROP COLUMN traded;
ALTER TABLE cards DROP COLUMN locked_in_trade_id;
DROP TABLE trade_items;
DROP TABLE trades;
