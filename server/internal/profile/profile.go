// Package profile reads a player's public profile (stats and showcase cards) and
// saves the showcase they pick.
package profile

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/mint"
	"cardgame/server/internal/store"
)

var (
	// ErrNotFound: no player with that username.
	ErrNotFound = errors.New("profile: no such player")
	// ErrBadShowcase: too many cards, or the same card twice.
	ErrBadShowcase = errors.New("profile: invalid showcase")
	// ErrNotOwned: a showcase card isn't the player's.
	ErrNotOwned = errors.New("profile: card not owned")
)

// Profile is what other players see.
type Profile struct {
	User            store.User
	CardCount       int
	CollectionPower int
	Recipes         int
	// Podiums: weekly seasons finished in the top 3.
	Podiums int
	// Showcase in order: the player's pick, or (until they pick) their best cards.
	Showcase []store.GetOwnedCardsRow
	// Chosen is false while the showcase is the automatic "best cards".
	Chosen bool
}

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// Get is the profile of the player with this username (case-insensitive).
func (s *Service) Get(ctx context.Context, username string) (Profile, error) {
	q := store.New(s.pool)
	user, err := q.GetUserByUsername(ctx, username)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	if err != nil {
		return Profile{}, err
	}
	return s.load(ctx, q, user)
}

func (s *Service) load(ctx context.Context, q *store.Queries, user store.User) (Profile, error) {
	stats, err := q.GetProfileStats(ctx, user.ID)
	if err != nil {
		return Profile{}, err
	}
	p := Profile{
		User:            user,
		CardCount:       int(stats.CardCount),
		CollectionPower: int(stats.CollectionPower),
		Recipes:         int(stats.Recipes),
		Podiums:         int(stats.Podiums),
	}
	ids, err := q.ListShowcaseCardIDs(ctx, user.ID)
	if err != nil {
		return Profile{}, err
	}
	p.Chosen = len(ids) > 0
	if !p.Chosen {
		if ids, err = q.ListBestCardIDs(ctx, store.ListBestCardIDsParams{UserID: user.ID, LimitN: game.MaxShowcase}); err != nil {
			return Profile{}, err
		}
	}
	if p.Showcase, err = mint.LoadCards(ctx, q, ids); err != nil {
		return Profile{}, err
	}
	return p, nil
}

// SetShowcase replaces the player's showcase with these cards, in this order. An empty
// list goes back to showing their best cards. Returns the updated profile.
func (s *Service) SetShowcase(ctx context.Context, user store.User, cardIDs []uuid.UUID) (Profile, error) {
	if len(cardIDs) > game.MaxShowcase {
		return Profile{}, fmt.Errorf("%w: at most %d cards", ErrBadShowcase, game.MaxShowcase)
	}
	seen := map[uuid.UUID]bool{}
	for _, id := range cardIDs {
		if seen[id] {
			return Profile{}, fmt.Errorf("%w: the same card twice", ErrBadShowcase)
		}
		seen[id] = true
	}
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := store.New(tx)
		owned, err := q.CountOwnedCards(ctx, store.CountOwnedCardsParams{UserID: user.ID, Ids: cardIDs})
		if err != nil {
			return err
		}
		if int(owned) != len(cardIDs) {
			return ErrNotOwned
		}
		if err := q.ClearShowcase(ctx, user.ID); err != nil {
			return err
		}
		for i, id := range cardIDs {
			if err := q.AddShowcaseCard(ctx, store.AddShowcaseCardParams{UserID: user.ID, Position: int16(i + 1), CardID: id}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return Profile{}, err
	}
	return s.load(ctx, store.New(s.pool), user)
}
