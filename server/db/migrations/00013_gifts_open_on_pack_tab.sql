-- Partner gifts wait on the Pack tab: a trade records the gift, and the card is rolled
-- and minted when the player opens it (POST /gifts/open).

-- +goose Up
ALTER TABLE trade_gifts ALTER COLUMN card_id DROP NOT NULL;
ALTER TABLE trade_gifts ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE trade_gifts ADD COLUMN opened_at timestamptz;
-- Gifts given before this were already cards.
UPDATE trade_gifts SET opened_at = now() WHERE card_id IS NOT NULL;
ALTER TABLE trade_gifts ADD CONSTRAINT trade_gifts_opened_check CHECK ((card_id IS NULL) = (opened_at IS NULL));
CREATE INDEX trade_gifts_waiting_idx ON trade_gifts (user_id, created_at) WHERE opened_at IS NULL;

-- +goose Down
DROP INDEX trade_gifts_waiting_idx;
ALTER TABLE trade_gifts DROP CONSTRAINT trade_gifts_opened_check;
DELETE FROM trade_gifts WHERE card_id IS NULL;
ALTER TABLE trade_gifts DROP COLUMN opened_at;
ALTER TABLE trade_gifts DROP COLUMN created_at;
ALTER TABLE trade_gifts ALTER COLUMN card_id SET NOT NULL;
