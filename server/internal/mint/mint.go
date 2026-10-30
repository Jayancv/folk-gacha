// Package mint hands out new copies of season cards: pick cards by drop weight
// within the copy limits, then take the copies inside the caller's transaction.
// Daily packs and recipe merges both create cards through it.
package mint

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/store"
)

var (
	// ErrSoldOut: no card that could be picked has copies left.
	ErrSoldOut = errors.New("mint: sold out")
	// errRaced: a card sold out between listing and taking it; the transaction is retried.
	errRaced = errors.New("mint: card sold out during the transaction")
)

// Card is a season card that can still be pulled.
type Card = store.ListPullableCardsRow

// Pick chooses a card for each rarity slot: by drop_weight within the rarity,
// skipping cards whose copies would run out (counting earlier slots), and
// falling back to another rarity when one is sold out (game.FallbackRarity).
func Pick(rng game.Rand, slots []game.Rarity, pullable []Card) ([]Card, error) {
	taken := map[string]int32{}
	left := func(c Card) bool {
		return !c.MaxCopies.Valid || c.Minted+taken[c.ID] < c.MaxCopies.Int32
	}
	byRarity := map[game.Rarity][]Card{}
	for _, c := range pullable {
		byRarity[game.Rarity(c.Rarity)] = append(byRarity[game.Rarity(c.Rarity)], c)
	}
	available := func(r game.Rarity) bool { return slices.ContainsFunc(byRarity[r], left) }

	out := make([]Card, len(slots))
	for i, want := range slots {
		r, ok := game.FallbackRarity(want, available)
		if !ok {
			return nil, ErrSoldOut
		}
		pool := byRarity[r]
		weights := make([]float64, len(pool))
		for j, c := range pool {
			if left(c) {
				weights[j] = c.DropWeight
			}
		}
		j := game.WeightedIndex(rng, weights)
		if j < 0 {
			return nil, ErrSoldOut // every card left has weight 0
		}
		out[i] = pool[j]
		taken[pool[j].ID]++
	}
	return out, nil
}

// Take mints the copies of the picked cards and returns each pick's copy
// number. Season cards are updated in id order so two transactions never wait
// on each other's rows in opposite orders (deadlock).
func Take(ctx context.Context, q *store.Queries, picks []Card) ([]int32, error) {
	count := map[string]int32{}
	for _, p := range picks {
		count[p.ID]++
	}
	ids := make([]string, 0, len(count))
	for id := range count {
		ids = append(ids, id)
	}
	slices.Sort(ids)

	next := map[string]int32{} // next copy number to hand out
	for _, id := range ids {
		minted, err := q.MintSeasonCard(ctx, store.MintSeasonCardParams{ID: id, Count: count[id]})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errRaced
		}
		if err != nil {
			return nil, err
		}
		next[id] = minted - count[id] + 1
	}
	copyNos := make([]int32, len(picks))
	for i, p := range picks {
		copyNos[i] = next[p.ID]
		next[p.ID]++
	}
	return copyNos, nil
}

// maxAttempts bounds retries when a limited card sells out mid-transaction or
// two transactions deadlock; each retry starts over from fresh data.
const maxAttempts = 3

// InTx runs fn in a transaction, retrying it when Take lost a race for the
// last copies or Postgres reports a deadlock or serialization failure.
func InTx(ctx context.Context, pool *pgxpool.Pool, fn func(q *store.Queries) error) error {
	for attempt := 1; ; attempt++ {
		err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error { return fn(store.New(tx)) })
		if errors.Is(err, errRaced) && attempt == maxAttempts {
			return ErrSoldOut
		}
		if err == nil || attempt == maxAttempts || !(errors.Is(err, errRaced) || retryable(err)) {
			return err
		}
	}
}

// IsUniqueViolation reports whether err is a unique_violation on the named constraint.
func IsUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}

// retryable: deadlock_detected or serialization_failure.
func retryable(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && (pgErr.Code == "40P01" || pgErr.Code == "40001")
}

// GlobalRand uses math/rand/v2's top-level generator (securely seeded, goroutine-safe).
type GlobalRand struct{}

func (GlobalRand) Float64() float64 { return rand.Float64() }

// LoadCards returns the cards with their display fields, in the order of ids.
func LoadCards(ctx context.Context, q *store.Queries, ids []uuid.UUID) ([]store.GetOwnedCardsRow, error) {
	rows, err := q.GetOwnedCards(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]store.GetOwnedCardsRow, len(rows))
	for _, r := range rows {
		byID[r.ID] = r
	}
	out := make([]store.GetOwnedCardsRow, len(ids))
	for i, id := range ids {
		r, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("card %s not found", id)
		}
		out[i] = r
	}
	return out, nil
}
