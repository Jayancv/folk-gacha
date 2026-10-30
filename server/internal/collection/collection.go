// Package collection reads a player's cards: filtered, sorted and paged.
package collection

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/store"
)

const (
	DefaultLimit = 60
	MaxLimit     = 200
)

// Sorts the collection supports. The empty string means SortNewest.
const (
	SortNewest = "newest"
	SortScore  = "score"
	SortNumber = "number"
)

// ErrBadFilter wraps every filter validation error.
var ErrBadFilter = errors.New("bad filter")

// Filter selects and orders cards. Zero values mean "any" / defaults.
type Filter struct {
	Rarities []string
	Elements []string
	Level    int
	Spirit   string
	Set      string
	Sort     string
	Limit    int
	Offset   int
}

// Normalize applies defaults and checks the values, so the query never sees
// an unknown sort or an unbounded page.
func (f Filter) Normalize() (Filter, error) {
	for _, r := range f.Rarities {
		if game.Rarity(r).Rank() < 0 {
			return f, fmt.Errorf("%w: unknown rarity %q", ErrBadFilter, r)
		}
	}
	switch {
	case f.Level != 0 && (f.Level < 1 || f.Level > game.MaxLevel):
		return f, fmt.Errorf("%w: level must be 1-%d", ErrBadFilter, game.MaxLevel)
	case f.Offset < 0:
		return f, fmt.Errorf("%w: offset can't be negative", ErrBadFilter)
	case f.Limit < 0 || f.Limit > MaxLimit:
		return f, fmt.Errorf("%w: limit must be 1-%d", ErrBadFilter, MaxLimit)
	}
	if f.Sort == "" {
		f.Sort = SortNewest
	}
	if !slices.Contains([]string{SortNewest, SortScore, SortNumber}, f.Sort) {
		return f, fmt.Errorf("%w: unknown sort %q", ErrBadFilter, f.Sort)
	}
	if f.Limit == 0 {
		f.Limit = DefaultLimit
	}
	return f, nil
}

// Page is one page of cards.
type Page struct {
	Cards []store.GetOwnedCardsRow
	// Total cards matching the filter across all pages.
	Total int
	// NextOffset is the offset of the next page, or -1 on the last page.
	NextOffset int
}

// Service lists collections.
type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// List returns one page of the player's cards.
func (s *Service) List(ctx context.Context, owner uuid.UUID, f Filter) (Page, error) {
	f, err := f.Normalize()
	if err != nil {
		return Page{}, err
	}
	q := store.New(s.pool)
	rows, err := q.ListOwnedCardIDs(ctx, store.ListOwnedCardIDsParams{
		OwnerID:    owner,
		Rarities:   f.Rarities,
		Elements:   f.Elements,
		Level:      pgtype.Int2{Int16: int16(f.Level), Valid: f.Level != 0},
		Spirit:     pgtype.Text{String: f.Spirit, Valid: f.Spirit != ""},
		CardSeason: pgtype.Text{String: f.Set, Valid: f.Set != ""},
		Sort:       f.Sort,
		PageLimit:  int32(f.Limit),
		PageOffset: int32(f.Offset),
	})
	if err != nil {
		return Page{}, err
	}
	page := Page{Cards: []store.GetOwnedCardsRow{}, NextOffset: -1}
	if len(rows) == 0 {
		return page, nil
	}
	ids := make([]uuid.UUID, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	// Cards could vanish between the two reads (a merge on another device);
	// LoadCards would then fail, so skip what's gone instead.
	cards, err := q.GetOwnedCards(ctx, ids)
	if err != nil {
		return Page{}, err
	}
	byID := make(map[uuid.UUID]store.GetOwnedCardsRow, len(cards))
	for _, c := range cards {
		byID[c.ID] = c
	}
	for _, id := range ids {
		if c, ok := byID[id]; ok {
			page.Cards = append(page.Cards, c)
		}
	}
	page.Total = int(rows[0].Total)
	if next := f.Offset + len(rows); next < page.Total {
		page.NextOffset = next
	}
	return page, nil
}
