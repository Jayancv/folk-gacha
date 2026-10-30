// Package leaderboard reads weekly season standings: live from season_points while
// a week is running, from the frozen season_results once the rollover finalized it.
// It never writes.
package leaderboard

import (
	"context"
	"errors"
	"regexp"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/store"
)

// TopN is how many players a leaderboard lists.
const TopN = 100

var (
	// ErrNotFound: no such season (bad id, or a week nobody played and that has no row).
	ErrNotFound = errors.New("leaderboard: season not found")
	seasonID    = regexp.MustCompile(`^\d{4}-W\d{2}$`)
)

// Entry is one ranked player.
type Entry struct {
	Rank     int
	UserID   uuid.UUID
	Username string
	Points   int
}

// Board is a season's standings.
type Board struct {
	Season game.Season
	// Final once the rollover froze the standings; until then they are live.
	Final bool
	// PreviousID is the week before this one (its board may be empty or missing).
	PreviousID string
	Top        []Entry
	// Players is how many players are ranked (have points) in total.
	Players int
	// You is the viewer's own standing; nil when signed out or without points.
	You *Entry
}

type Service struct {
	pool *pgxpool.Pool
	// Now is replaceable in tests.
	Now func() time.Time
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, Now: time.Now}
}

// Current is this week's board. A week nobody has scored in yet is an empty board,
// not an error (its season row may not exist yet, and reading never creates it).
func (s *Service) Current(ctx context.Context, viewer *uuid.UUID) (Board, error) {
	current := game.SeasonFor(s.Now())
	b, err := s.Season(ctx, current.ID, viewer)
	if errors.Is(err, ErrNotFound) {
		return Board{Season: current, PreviousID: previousID(current), Top: []Entry{}}, nil
	}
	return b, err
}

// Season is the board of the season with this id ("2026-W44").
func (s *Service) Season(ctx context.Context, id string, viewer *uuid.UUID) (Board, error) {
	if !seasonID.MatchString(id) {
		return Board{}, ErrNotFound
	}
	q := store.New(s.pool)
	row, err := q.GetSeason(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Board{}, ErrNotFound
	}
	if err != nil {
		return Board{}, err
	}
	season := game.Season{ID: row.ID, StartsAt: row.StartsAt.UTC(), EndsAt: row.EndsAt.UTC()}
	b := Board{Season: season, Final: row.FinalizedAt.Valid, PreviousID: previousID(season), Top: []Entry{}}
	if b.Final {
		err = s.final(ctx, q, &b, viewer)
	} else {
		err = s.live(ctx, q, &b, viewer)
	}
	return b, err
}

func (s *Service) live(ctx context.Context, q *store.Queries, b *Board, viewer *uuid.UUID) error {
	rows, err := q.ListLiveTop(ctx, store.ListLiveTopParams{SeasonID: b.Season.ID, TopN: TopN})
	if err != nil {
		return err
	}
	for _, r := range rows {
		b.Top = append(b.Top, Entry{Rank: int(r.Rank), UserID: r.UserID, Username: r.Username, Points: int(r.Points)})
		b.Players = int(r.Players)
	}
	if viewer == nil {
		return nil
	}
	me, err := q.GetLiveRank(ctx, store.GetLiveRankParams{SeasonID: b.Season.ID, UserID: *viewer})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	b.You = &Entry{Rank: int(me.Rank), UserID: *viewer, Points: int(me.Points)}
	b.Players = int(me.Players)
	return nil
}

func (s *Service) final(ctx context.Context, q *store.Queries, b *Board, viewer *uuid.UUID) error {
	rows, err := q.ListFinalTop(ctx, store.ListFinalTopParams{SeasonID: b.Season.ID, TopN: TopN})
	if err != nil {
		return err
	}
	for _, r := range rows {
		b.Top = append(b.Top, Entry{Rank: int(r.Rank), UserID: r.UserID, Username: r.Username, Points: int(r.Points)})
		b.Players = int(r.Players)
	}
	if viewer == nil {
		return nil
	}
	me, err := q.GetFinalRank(ctx, store.GetFinalRankParams{SeasonID: b.Season.ID, UserID: *viewer})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	b.You = &Entry{Rank: int(me.Rank), UserID: *viewer, Points: int(me.Points)}
	b.Players = int(me.Players)
	return nil
}

func previousID(s game.Season) string {
	return game.SeasonFor(s.StartsAt.Add(-time.Nanosecond)).ID
}
