-- name: LockTrader :one
-- A player taking part in a trade, row-locked so their offers per day are counted
-- one transaction at a time (two offers sent at once can't both slip under the limit).
SELECT id, username, created_at FROM users WHERE id = $1 FOR UPDATE;

-- name: CountTradesSince :one
-- Offers the player has sent since @since (the start of the UTC day).
SELECT count(*) FROM trades WHERE from_user = @from_user AND created_at >= @since;

-- name: LockTradeCards :many
-- Cards of a trade, any owner, row-locked in id order (so trades and merges of the
-- same cards can't deadlock). Cards that no longer exist are missing.
SELECT id, owner_id, locked_in_trade_id FROM cards
WHERE id = ANY(@ids::uuid[])
ORDER BY id
FOR UPDATE;

-- name: CreateTrade :one
INSERT INTO trades (from_user, to_user, created_at, expires_at)
VALUES (@from_user, @to_user, @created_at, @expires_at)
RETURNING id;

-- name: AddTradeItems :exec
-- One side's cards, keeping the order they were picked in.
INSERT INTO trade_items (trade_id, card_id, side, position)
SELECT @trade_id, card_id, @side, ord
FROM unnest(@card_ids::uuid[]) WITH ORDINALITY AS t(card_id, ord);

-- name: LockCardsInTrade :exec
UPDATE cards SET locked_in_trade_id = @trade_id::uuid WHERE id = ANY(@ids::uuid[]);

-- name: LockTrade :one
-- The trade, row-locked: accept, decline, cancel and expiry of one trade run one at a time.
SELECT * FROM trades WHERE id = $1 FOR UPDATE;

-- name: ResolveTrade :exec
UPDATE trades SET status = @status, resolved_at = @resolved_at::timestamptz WHERE id = @id;

-- name: UnlockTradeCards :exec
UPDATE cards SET locked_in_trade_id = NULL WHERE locked_in_trade_id = @trade_id::uuid;

-- name: MoveCards :exec
-- Hands cards to their new owner. They count as traded from now on (no season points).
UPDATE cards
SET owner_id = @owner_id, acquired_via = 'trade', acquired_at = @acquired_at,
    traded = true, locked_in_trade_id = NULL
WHERE id = ANY(@ids::uuid[]);

-- name: RemoveFromShowcases :exec
-- A traded card leaves its old owner's showcase (and frees it for the new owner's).
DELETE FROM showcase_cards WHERE card_id = ANY(@ids::uuid[]);

-- name: ExpireDueTrades :many
-- Expires open offers past their time and unlocks their cards; returns them so both
-- players can be told. Waits for (and then skips) a trade that an accept is
-- finishing, since that takes the same row lock.
WITH due AS (
    UPDATE trades SET status = 'expired', resolved_at = @now::timestamptz
    WHERE status = 'open' AND expires_at <= @now::timestamptz
    RETURNING id, from_user, to_user
), unlocked AS (
    UPDATE cards SET locked_in_trade_id = NULL
    WHERE locked_in_trade_id IN (SELECT id FROM due)
    RETURNING 1
)
SELECT id, from_user, to_user FROM due;

-- name: ListTrades :many
-- A player's open offers (both directions) and those resolved since @since, newest first.
SELECT t.*, fu.username AS from_username, tu.username AS to_username
FROM trades t
JOIN users fu ON fu.id = t.from_user
JOIN users tu ON tu.id = t.to_user
WHERE (t.from_user = @user_id OR t.to_user = @user_id)
  AND (t.status = 'open' OR t.resolved_at >= @since::timestamptz)
ORDER BY t.created_at DESC, t.id
LIMIT 100;

-- name: GetTrade :one
SELECT t.*, fu.username AS from_username, tu.username AS to_username
FROM trades t
JOIN users fu ON fu.id = t.from_user
JOIN users tu ON tu.id = t.to_user
WHERE t.id = $1;

-- name: ListTradeItems :many
SELECT trade_id, card_id, side FROM trade_items
WHERE trade_id = ANY(@trade_ids::uuid[])
ORDER BY trade_id, side, position;

-- name: AddTradePartners :one
-- Records that two players traded (user_a < user_b). False when they already had.
WITH added AS (
    INSERT INTO trade_partners (user_a, user_b, first_trade_id, created_at)
    VALUES (@user_a, @user_b, @first_trade_id, @created_at)
    ON CONFLICT DO NOTHING
    RETURNING 1
)
SELECT EXISTS (SELECT 1 FROM added);

-- name: CountGift :one
-- Counts one more gift for the player this week, unless they already got @max_gifts.
-- False when they're at the cap (nothing changes).
WITH counted AS (
    INSERT INTO trade_gift_weeks AS w (user_id, week, gifts) VALUES (@user_id, @week, 1)
    ON CONFLICT (user_id, week) DO UPDATE SET gifts = w.gifts + 1
    WHERE w.gifts < @max_gifts::smallint
    RETURNING 1
)
SELECT EXISTS (SELECT 1 FROM counted);

-- name: AddTradeGift :exec
-- A gift waiting on the player's Pack tab; its card is made when they open it.
INSERT INTO trade_gifts (trade_id, user_id, created_at) VALUES (@trade_id, @user_id, @created_at);

-- name: ListTradeGifts :many
SELECT trade_id, user_id FROM trade_gifts WHERE trade_id = ANY(@trade_ids::uuid[]);

-- name: CountWaitingGifts :one
SELECT count(*) FROM trade_gifts WHERE user_id = $1 AND opened_at IS NULL;

-- name: LockWaitingGifts :many
-- The player's unopened gifts, oldest first, row-locked: two opens at once can't
-- open the same gift (the second sees it opened and skips it).
SELECT g.trade_id, u.username AS partner
FROM trade_gifts g
JOIN trades t ON t.id = g.trade_id
JOIN users u ON u.id = CASE WHEN t.from_user = g.user_id THEN t.to_user ELSE t.from_user END
WHERE g.user_id = @user_id AND g.opened_at IS NULL
ORDER BY g.created_at, g.trade_id
LIMIT @max_gifts
FOR UPDATE OF g;

-- name: OpenTradeGift :exec
UPDATE trade_gifts SET card_id = @card_id::uuid, opened_at = @opened_at::timestamptz
WHERE trade_id = @trade_id AND user_id = @user_id;
