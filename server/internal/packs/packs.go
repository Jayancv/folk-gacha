// Package packs runs the daily pack claim: one database transaction that checks
// today's claim, rolls the cards (rules in internal/game) and saves them.
package packs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/mint"
	"cardgame/server/internal/store"
)

var (
	// ErrAlreadyClaimed: the player's pack for this UTC day is already open.
	ErrAlreadyClaimed = errors.New("packs: already claimed today")
	// ErrNoSeason: no card season is open, or it has no cards left.
	ErrNoSeason = errors.New("packs: no card season to draw from")
)

// Service claims daily packs.
type Service struct {
	pool *pgxpool.Pool
	// Now and Rand are replaceable in tests. Rand must be safe for concurrent use.
	Now  func() time.Time
	Rand game.Rand
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, Now: time.Now, Rand: mint.GlobalRand{}}
}

// Claim is an opened daily pack.
type Claim struct {
	Day time.Time
	// Cards in reveal order.
	Cards     []store.GetOwnedCardsRow
	NextReset time.Time
}

// Status is whether today's pack can be claimed.
type Status struct {
	Ready     bool
	NextReset time.Time
}

// Status reports whether the player can claim a pack right now.
func (s *Service) Status(ctx context.Context, userID uuid.UUID) (Status, error) {
	now := s.Now()
	claimed, err := store.New(s.pool).HasClaimedDay(ctx, store.HasClaimedDayParams{UserID: userID, Day: game.ClaimDay(now)})
	if err != nil {
		return Status{}, err
	}
	return Status{Ready: !claimed, NextReset: game.NextReset(now)}, nil
}

// ClaimDaily opens today's pack for the player.
func (s *Service) ClaimDaily(ctx context.Context, userID uuid.UUID) (Claim, error) {
	now := s.Now()
	var ids []uuid.UUID
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		var err error
		ids, err = s.claimTx(ctx, q, userID, now)
		return err
	})
	switch {
	case mint.IsUniqueViolation(err, "daily_claims_pkey"):
		return Claim{}, ErrAlreadyClaimed // the primary key caught a concurrent claim
	case errors.Is(err, mint.ErrSoldOut):
		return Claim{}, ErrNoSeason
	case err != nil:
		return Claim{}, err
	}
	cards, err := mint.LoadCards(ctx, store.New(s.pool), ids)
	if err != nil {
		return Claim{}, err
	}
	return Claim{Day: game.ClaimDay(now), Cards: cards, NextReset: game.NextReset(now)}, nil
}

func (s *Service) claimTx(ctx context.Context, q *store.Queries, userID uuid.UUID, now time.Time) ([]uuid.UUID, error) {
	// Lock the player so their claims run one at a time; others aren't blocked.
	if _, err := q.LockUser(ctx, userID); err != nil {
		return nil, fmt.Errorf("lock user: %w", err)
	}
	day := game.ClaimDay(now)
	claimed, err := q.HasClaimedDay(ctx, store.HasClaimedDayParams{UserID: userID, Day: day})
	if err != nil {
		return nil, err
	}
	if claimed {
		return nil, ErrAlreadyClaimed
	}
	season, err := q.CurrentCardSeason(ctx, now)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoSeason
	}
	if err != nil {
		return nil, err
	}
	dry, err := q.LastPityCounter(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		dry = 0
	} else if err != nil {
		return nil, err
	}

	pullable, err := q.ListPullableCards(ctx, store.ListPullableCardsParams{CardSeasonID: season.ID})
	if err != nil {
		return nil, err
	}
	picks, err := mint.Pick(s.Rand, game.RollPack(s.Rand, int(dry)), pullable)
	if err != nil {
		return nil, err
	}

	got := make([]game.Rarity, len(picks))
	for i, p := range picks {
		got[i] = game.Rarity(p.Rarity)
	}
	if err := q.InsertDailyClaim(ctx, store.InsertDailyClaimParams{
		UserID: userID, Day: day, CardSeasonID: season.ID,
		PityCounter: int32(game.DryPacksAfter(int(dry), got)),
	}); err != nil {
		return nil, err
	}

	copyNos, err := mint.Take(ctx, q, picks)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(picks))
	for i, p := range picks {
		ids[i], err = q.CreateCard(ctx, store.CreateCardParams{
			SeasonCardID: p.ID, CopyNo: copyNos[i], OwnerID: userID, Level: 1, AcquiredVia: "pack",
		})
		if err != nil {
			return nil, err
		}
	}
	return ids, nil
}
