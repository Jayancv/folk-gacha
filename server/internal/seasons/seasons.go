// Package seasons runs the weekly leaderboard seasons: it makes sure the current
// week's season exists and, once a week is over, freezes its final standings.
package seasons

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/store"
)

// Service runs the rollover. Safe to run on several servers at once.
type Service struct {
	pool *pgxpool.Pool
	// Now is replaceable in tests.
	Now func() time.Time
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, Now: time.Now}
}

// Ensure creates the row for the season containing t, if missing, and returns
// the season. Claims and merges call it inside their own transactions.
func Ensure(ctx context.Context, q *store.Queries, t time.Time) (game.Season, error) {
	s := game.SeasonFor(t)
	err := q.EnsureSeason(ctx, store.EnsureSeasonParams{ID: s.ID, StartsAt: s.StartsAt, EndsAt: s.EndsAt})
	return s, err
}

// Rollover makes sure the current season exists, then freezes the standings of
// every season that ended at least game.FinalizeGrace ago. It returns the ids
// of the seasons it finalized. Missed weeks (server down) are caught up in order.
func (s *Service) Rollover(ctx context.Context) ([]string, error) {
	now := s.Now()
	q := store.New(s.pool)
	if _, err := Ensure(ctx, q, now); err != nil {
		return nil, err
	}
	due, err := q.ListSeasonsToFinalize(ctx, now.Add(-game.FinalizeGrace))
	if err != nil {
		return nil, err
	}
	var done []string
	for _, id := range due {
		ok, err := s.finalize(ctx, id, now)
		if err != nil {
			return done, err
		}
		if ok {
			done = append(done, id)
		}
	}
	return done, nil
}

// finalize freezes one season's standings. It reports false when another
// server got there first.
func (s *Service) finalize(ctx context.Context, id string, now time.Time) (bool, error) {
	var ranked int64
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := store.New(tx)
		// The row lock makes a second server wait, then find finalized_at set.
		if _, err := q.LockSeasonToFinalize(ctx, id); err != nil {
			return err
		}
		var err error
		if ranked, err = q.FreezeSeasonResults(ctx, id); err != nil {
			return err
		}
		return q.MarkSeasonFinalized(ctx, store.MarkSeasonFinalizedParams{ID: id, FinalizedAt: pgtype.Timestamptz{Time: now, Valid: true}})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	slog.InfoContext(ctx, "season finalized", "season", id, "ranked", ranked)
	return true, nil
}

// Run calls Rollover now and then every `every` until ctx is done. Errors are
// logged and retried on the next tick, so a database blip doesn't stop the job.
func (s *Service) Run(ctx context.Context, every time.Duration) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		if _, err := s.Rollover(ctx); err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "season rollover failed", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
