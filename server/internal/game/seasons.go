package game

import (
	"fmt"
	"time"
)

// FinalizeGrace is how long after a weekly season ends its standings are frozen,
// so a claim or merge that started just before Monday 00:00 UTC still counts.
const FinalizeGrace = 5 * time.Minute

// Season is one weekly leaderboard season: Monday 00:00 UTC up to (not
// including) the next Monday 00:00 UTC. Not the same as a card season.
type Season struct {
	// ID is the ISO week, e.g. "2026-W44".
	ID       string
	StartsAt time.Time
	EndsAt   time.Time
}

// SeasonFor is the weekly season that contains t.
func SeasonFor(t time.Time) Season {
	day := ClaimDay(t)
	sinceMonday := (int(day.Weekday()) + 6) % 7 // Monday = 0 … Sunday = 6
	start := day.AddDate(0, 0, -sinceMonday)
	// ISO weeks start on Monday, so the week of `start` is the week of every day in the season.
	year, week := start.ISOWeek()
	return Season{ID: fmt.Sprintf("%04d-W%02d", year, week), StartsAt: start, EndsAt: start.AddDate(0, 0, 7)}
}

// ReadyToFinalize reports whether a season that ended at endsAt can have its
// standings frozen at now.
func ReadyToFinalize(endsAt, now time.Time) bool {
	return !now.Before(endsAt.Add(FinalizeGrace))
}
