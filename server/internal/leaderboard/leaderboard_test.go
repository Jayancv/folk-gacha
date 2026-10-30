package leaderboard_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/leaderboard"
	"cardgame/server/internal/seasons"
	"cardgame/server/internal/store"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

// Friday of ISO week 2026-W44 (Mon 26 Oct – Mon 2 Nov).
var friday = time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)

const week44 = "2026-W44"

func setup(t *testing.T) (*pgxpool.Pool, *leaderboard.Service) {
	t.Helper()
	pool := dbtest.Pool(t)
	if _, err := pool.Exec(context.Background(), "TRUNCATE users, seasons, season_points, season_results CASCADE"); err != nil {
		t.Fatal(err)
	}
	svc := leaderboard.NewService(pool)
	svc.Now = func() time.Time { return friday }
	return pool, svc
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	u, err := store.New(pool).CreateUser(context.Background(), store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func score(t *testing.T, pool *pgxpool.Pool, user uuid.UUID, points int, at time.Time) {
	t.Helper()
	if _, _, err := seasons.AddPoints(context.Background(), store.New(pool), user, at, points); err != nil {
		t.Fatal(err)
	}
}

func names(b leaderboard.Board) []string {
	out := []string{}
	for _, e := range b.Top {
		out = append(out, fmt.Sprintf("%d:%s:%d", e.Rank, e.Username, e.Points))
	}
	return out
}

func eq(t *testing.T, what string, got []string, want ...string) {
	t.Helper()
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}

func TestCurrentWeekIsLive(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	asha, nimal, kumari := newUser(t, pool, "asha"), newUser(t, pool, "nimal"), newUser(t, pool, "kumari")
	newUser(t, pool, "idle") // no points: not ranked
	score(t, pool, asha, 500, friday)
	score(t, pool, nimal, 800, friday.Add(time.Hour))
	score(t, pool, kumari, 500, friday.Add(-time.Hour)) // ties asha but got there first

	b, err := svc.Current(ctx, &asha)
	if err != nil {
		t.Fatal(err)
	}
	if b.Season.ID != week44 || b.Final || b.PreviousID != "2026-W43" || b.Players != 3 {
		t.Fatalf("board %+v", b)
	}
	eq(t, "top", names(b), "1:nimal:800", "2:kumari:500", "3:asha:500")
	if b.You == nil || b.You.Rank != 3 || b.You.Points != 500 {
		t.Fatalf("you = %+v", b.You)
	}

	// Signed out, or signed in without points: no "you".
	if b, _ := svc.Current(ctx, nil); b.You != nil {
		t.Fatal("signed-out viewer has a rank")
	}
	idle := newUser(t, pool, "idle2")
	if b, _ := svc.Current(ctx, &idle); b.You != nil || b.Players != 3 {
		t.Fatalf("player without points: you=%+v players=%d", b.You, b.Players)
	}
}

func TestTop100AndYourRankBelowIt(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	// 105 players with 1000, 999, … 896 points.
	if _, err := pool.Exec(ctx, `INSERT INTO users (auth_id, username)
		SELECT 'test:p' || i, 'p' || lpad(i::text, 3, '0') FROM generate_series(1, 105) i`); err != nil {
		t.Fatal(err)
	}
	if _, err := seasons.Ensure(ctx, store.New(pool), friday); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO season_points (season_id, user_id, points, updated_at)
		SELECT $1, id, 1001 - substr(username, 2)::int, $2 FROM users WHERE username LIKE 'p%'`, week44, friday); err != nil {
		t.Fatal(err)
	}
	var last uuid.UUID
	if err := pool.QueryRow(ctx, "SELECT id FROM users WHERE username = 'p105'").Scan(&last); err != nil {
		t.Fatal(err)
	}
	b, err := svc.Current(ctx, &last)
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Top) != leaderboard.TopN || b.Players != 105 || b.Top[0].Username != "p001" || b.Top[99].Rank != 100 {
		t.Fatalf("top %d (first %v, last %v), players %d", len(b.Top), b.Top[0], b.Top[len(b.Top)-1], b.Players)
	}
	if b.You == nil || b.You.Rank != 105 || b.You.Points != 896 {
		t.Fatalf("you = %+v, want rank 105 outside the top 100", b.You)
	}
}

// After the rollover freezes a week, its board reads the frozen standings, and
// they're the same ranks the live board showed.
func TestFinishedWeekShowsFrozenStandings(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	users := map[string]uuid.UUID{}
	for i, name := range []string{"anu", "bimal", "chamari", "dilan"} {
		users[name] = newUser(t, pool, name)
		score(t, pool, users[name], 100*(i%2+1), friday.Add(time.Duration(i)*time.Minute)) // two ties
	}
	live, err := svc.Season(ctx, week44, nil)
	if err != nil {
		t.Fatal(err)
	}

	rollover := seasons.NewService(pool)
	rollover.Now = func() time.Time { return friday.AddDate(0, 0, 7) }
	if _, err := rollover.Rollover(ctx); err != nil {
		t.Fatal(err)
	}
	// Points can't reach the frozen week any more; the board still reads the frozen ranks.
	score(t, pool, users["anu"], 1000, friday)
	final, err := svc.Season(ctx, week44, &[]uuid.UUID{users["chamari"]}[0])
	if err != nil {
		t.Fatal(err)
	}
	if !final.Final || final.Players != 4 {
		t.Fatalf("final board %+v", final)
	}
	eq(t, "final ranks match live ranks", names(final), names(live)...)
	// chamari ties anu on 100 but scored later: 4th behind bimal, dilan (200 each) and anu.
	if final.You == nil || final.You.Rank != 4 {
		t.Fatalf("you = %+v", final.You)
	}

	// The new week is live and empty; its previous week is the frozen one.
	svc.Now = rollover.Now
	cur, err := svc.Current(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cur.Season.ID != "2026-W45" || cur.Final || len(cur.Top) != 0 || cur.PreviousID != week44 {
		t.Fatalf("new week %+v", cur)
	}
}

func TestEmptyAndUnknownWeeks(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	// Nobody has played this week: an empty board, and reading doesn't create the season.
	b, err := svc.Current(ctx, nil)
	if err != nil || b.Season.ID != week44 || len(b.Top) != 0 || b.Players != 0 || b.Top == nil {
		t.Fatalf("empty board %+v (%v)", b, err)
	}
	var rows int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM seasons").Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("reading the leaderboard created %d season rows", rows)
	}
	for _, id := range []string{"2020-W01", "nonsense", "2026-W4", "'; DROP TABLE seasons; --"} {
		if _, err := svc.Season(ctx, id, nil); !errors.Is(err, leaderboard.ErrNotFound) {
			t.Errorf("%q: err = %v", id, err)
		}
	}
}
