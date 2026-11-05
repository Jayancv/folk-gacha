-- name: EnsureTournament :exec
-- Creates the tournament if it doesn't exist yet (any caller, any number of times; the
-- first seed wins).
INSERT INTO tournaments (id, series, n, name, format, element, opens_at, closes_at, ends_at, seed, seed_hash, prizes)
VALUES (@id, @series, @n, @name, @format, sqlc.narg('element'), @opens_at, @closes_at, @ends_at, @seed, @seed_hash, @prizes::integer[])
ON CONFLICT DO NOTHING; -- either key (id, or series + n): two servers may create it at once

-- name: GetTournament :one
SELECT t.*, (SELECT count(*) FROM tournament_entries e WHERE e.tournament_id = t.id) AS entries
FROM tournaments t WHERE t.id = $1;

-- name: ListTournaments :many
-- Tournaments that haven't ended, and those that ended since @since; newest first.
SELECT t.*, (SELECT count(*) FROM tournament_entries e WHERE e.tournament_id = t.id) AS entries
FROM tournaments t
WHERE t.ends_at > @since::timestamptz
ORDER BY t.opens_at DESC, t.id
LIMIT 50;

-- name: ShareLockTournament :one
-- Entering and withdrawing share-lock the tournament; closing takes FOR UPDATE on the
-- same row, so it waits for lineups being saved, and they see the new status after it.
SELECT id, status, closes_at FROM tournaments WHERE id = $1 FOR SHARE;

-- name: LockTournamentToStep :one
-- Locks a tournament in @status for the job; no row means another server already moved it on.
SELECT * FROM tournaments WHERE id = @id AND status = @status FOR UPDATE;

-- name: ListTournamentsToClose :many
SELECT id FROM tournaments WHERE status = 'open' AND closes_at <= @now::timestamptz ORDER BY closes_at, id;

-- name: ListTournamentsToFinish :many
SELECT id FROM tournaments WHERE status = 'locked' AND ends_at <= @now::timestamptz ORDER BY ends_at, id;

-- name: SetTournamentStatus :exec
UPDATE tournaments SET status = @status WHERE id = @id;

-- name: LockCardRows :exec
-- Row-locks cards in id order (so entries, merges and trades of the same cards can't
-- deadlock), before reading them with ListLineupCards.
SELECT id FROM cards WHERE id = ANY(@ids::uuid[]) ORDER BY id FOR UPDATE;

-- name: ListLineupCards :many
-- Cards as a tournament sees them, with their locks. Missing ids don't exist any more.
SELECT c.id, c.owner_id, c.level, c.traded, c.acquired_at,
       c.locked_in_trade_id, c.locked_in_tournament_id,
       sc.template_id, sc.rarity, sc.score, t.element
FROM cards c
JOIN season_cards sc ON sc.id = c.season_card_id
JOIN card_templates t ON t.id = sc.template_id
WHERE c.id = ANY(@ids::uuid[])
ORDER BY c.id;

-- name: CardsInTournament :many
-- Which of @card_ids were entered in the tournament (any player).
SELECT card_id FROM tournament_entry_cards
WHERE tournament_id = @tournament_id AND card_id = ANY(@card_ids::uuid[]);

-- name: GetEntry :one
SELECT * FROM tournament_entries WHERE tournament_id = @tournament_id AND user_id = @user_id;

-- name: ListEntryCards :many
SELECT card_id, slot, snapshot FROM tournament_entry_cards
WHERE tournament_id = @tournament_id AND user_id = @user_id
ORDER BY slot;

-- name: SaveEntry :exec
INSERT INTO tournament_entries (tournament_id, user_id, entered_at, updated_at)
VALUES (@tournament_id, @user_id, @now, @now)
ON CONFLICT (tournament_id, user_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

-- name: ClearEntryCards :exec
DELETE FROM tournament_entry_cards WHERE tournament_id = @tournament_id AND user_id = @user_id;

-- name: AddEntryCards :exec
INSERT INTO tournament_entry_cards (tournament_id, user_id, slot, card_id)
SELECT @tournament_id, @user_id, ord, card_id
FROM unnest(@card_ids::uuid[]) WITH ORDINALITY AS t(card_id, ord);

-- name: DeleteEntry :execrows
DELETE FROM tournament_entries WHERE tournament_id = @tournament_id AND user_id = @user_id;

-- name: LockCardsInTournament :exec
UPDATE cards SET locked_in_tournament_id = @tournament_id::text WHERE id = ANY(@ids::uuid[]);

-- name: UnlockPlayerTournamentCards :exec
-- Frees the player's cards in the tournament, except @keep (the new lineup).
UPDATE cards SET locked_in_tournament_id = NULL
WHERE locked_in_tournament_id = @tournament_id::text AND owner_id = @owner_id
  AND NOT (id = ANY(@keep::uuid[]));

-- name: UnlockTournamentCards :execrows
UPDATE cards SET locked_in_tournament_id = NULL WHERE locked_in_tournament_id = @tournament_id::text;

-- name: ListAllEntryCards :many
-- Every lineup of the tournament, for scoring.
SELECT user_id, card_id, slot FROM tournament_entry_cards
WHERE tournament_id = $1
ORDER BY user_id, slot;

-- name: ListEntryUsers :many
SELECT user_id FROM tournament_entries WHERE tournament_id = $1 ORDER BY user_id;

-- name: SetEntrySnapshot :exec
UPDATE tournament_entry_cards SET snapshot = @snapshot
WHERE tournament_id = @tournament_id AND card_id = @card_id;

-- name: ScoreEntry :exec
UPDATE tournament_entries SET score = @score, rank = @rank, breakdown = @breakdown
WHERE tournament_id = @tournament_id AND user_id = @user_id;

-- name: AddTournamentPrizes :exec
-- @cards prize cards for a place, waiting on the winner's Pack tab (made when opened).
INSERT INTO tournament_prizes (tournament_id, user_id, n, place, created_at)
SELECT @tournament_id, @user_id, n, @place, @created_at
FROM generate_series(1, @cards::integer) AS n;

-- name: LockWaitingPrizes :many
-- The player's unopened prize cards, oldest first, row-locked like LockWaitingGifts.
SELECT p.tournament_id, p.n, p.place, p.created_at, t.name
FROM tournament_prizes p
JOIN tournaments t ON t.id = p.tournament_id
WHERE p.user_id = @user_id AND p.opened_at IS NULL
ORDER BY p.created_at, p.tournament_id, p.n
LIMIT @max_prizes
FOR UPDATE OF p;

-- name: OpenTournamentPrize :exec
UPDATE tournament_prizes SET card_id = @card_id::uuid, opened_at = @opened_at::timestamptz
WHERE tournament_id = @tournament_id AND user_id = @user_id AND n = @n;

-- name: ListTournamentResults :many
SELECT e.rank, e.score, e.user_id, u.username, u.public_name
FROM tournament_entries e
JOIN users u ON u.id = e.user_id
WHERE e.tournament_id = @tournament_id AND e.rank IS NOT NULL
ORDER BY e.rank
LIMIT @max_rows;

-- name: ListEnteredTournaments :many
-- Which of @ids the player has entered.
SELECT tournament_id FROM tournament_entries WHERE user_id = @user_id AND tournament_id = ANY(@ids::text[]);
