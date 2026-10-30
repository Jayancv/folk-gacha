package seasons_test

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/game"
	"cardgame/server/internal/seasons"
	"cardgame/server/internal/store"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

// Friday of ISO week 2026-W44 (Mon 26 Oct – Mon 2 Nov).
var friday = time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)

const week44 = "2026-W44"

func setup(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := dbtest.Pool(t)
	if _, err := pool.Exec(context.Background(), "TRUNCATE users, seasons, season_points, season_results CASCADE"); err != nil {
		t.Fatal(err)
	}
	return pool
}

func at(pool *pgxpool.Pool, now time.Time) *seasons.Service {
	s := seasons.NewService(pool)
	s.Now = func() time.Time { return now }
	return s
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	u, err := store.New(pool).CreateUser(context.Background(), store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

// score records a player's points in a season as of scoredAt.
func score(t *testing.T, pool *pgxpool.Pool, season string, user uuid.UUID, points int, scoredAt time.Time) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `INSERT INTO season_points (season_id, user_id, points, updated_at)
		VALUES ($1, $2, $3, $4)`, season, user, points, scoredAt); err != nil {
		t.Fatal(err)
	}
}

func results(t *testing.T, pool *pgxpool.Pool, season string) []string {
	t.Helper()
	rows, err := store.New(pool).ListSeasonResults(context.Background(), store.ListSeasonResultsParams{SeasonID: season, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Username
	}
	return out
}

func TestRolloverCreatesTheCurrentSeason(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	if _, err := at(pool, friday).Rollover(ctx); err != nil {
		t.Fatal(err)
	}
	s, err := store.New(pool).GetSeason(ctx, week44)
	if err != nil {
		t.Fatal(err)
	}
	if !s.StartsAt.Equal(time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)) || !s.EndsAt.Equal(time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)) || s.FinalizedAt.Valid {
		t.Fatalf("season %+v", s)
	}
	// Ensure is safe to call again (every claim and merge will).
	if _, err := seasons.Ensure(ctx, store.New(pool), friday); err != nil {
		t.Fatal(err)
	}
}

func TestStandingsFreezeAfterTheGracePeriod(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	if _, err := at(pool, friday).Rollover(ctx); err != nil {
		t.Fatal(err)
	}
	asha, nimal, kumari, idle := newUser(t, pool, "asha"), newUser(t, pool, "nimal"), newUser(t, pool, "kumari"), newUser(t, pool, "idle")
	score(t, pool, week44, asha, 500, friday)
	score(t, pool, week44, nimal, 800, friday.Add(time.Hour))
	score(t, pool, week44, kumari, 500, friday.Add(-time.Hour)) // same points as asha, got there first
	score(t, pool, week44, idle, 0, friday)

	end := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	for _, now := range []time.Time{end.Add(-time.Second), end, end.Add(game.FinalizeGrace - time.Second)} {
		done, err := at(pool, now).Rollover(ctx)
		if err != nil || len(done) != 0 {
			t.Fatalf("at %v: finalized %v (%v), want nothing yet", now, done, err)
		}
	}

	done, err := at(pool, end.Add(game.FinalizeGrace)).Rollover(ctx)
	if err != nil || !slices.Equal(done, []string{week44}) {
		t.Fatalf("finalized %v (%v)", done, err)
	}
	// Ties go to whoever reached the score first; 0 points isn't ranked.
	if got := results(t, pool, week44); !slices.Equal(got, []string{"nimal", "kumari", "asha"}) {
		t.Fatalf("standings %v", got)
	}
	s, _ := store.New(pool).GetSeason(ctx, week44)
	if !s.FinalizedAt.Valid {
		t.Fatal("season not marked finalized")
	}
	// The next week's season now exists too.
	if _, err := store.New(pool).GetSeason(ctx, "2026-W45"); err != nil {
		t.Fatalf("next season: %v", err)
	}

	// Running again changes nothing.
	again, err := at(pool, end.Add(time.Hour)).Rollover(ctx)
	if err != nil || len(again) != 0 {
		t.Fatalf("second rollover finalized %v (%v)", again, err)
	}
	if got := results(t, pool, week44); len(got) != 3 {
		t.Fatalf("standings changed: %v", got)
	}
}

func TestRolloverCatchesUpMissedWeeks(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	// Claims created the week 43 and 44 seasons while the job wasn't running,
	// and the server stayed down until two weeks later.
	for _, now := range []time.Time{friday.AddDate(0, 0, -7), friday} {
		if _, err := seasons.Ensure(ctx, store.New(pool), now); err != nil {
			t.Fatal(err)
		}
	}
	done, err := at(pool, friday.AddDate(0, 0, 14)).Rollover(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(done, []string{"2026-W43", week44}) {
		t.Fatalf("finalized %v, want weeks 43 and 44 in order", done)
	}
}

// Several servers running the job at the same moment finalize each season once.
func TestConcurrentRolloversFinalizeOnce(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	if _, err := at(pool, friday).Rollover(ctx); err != nil {
		t.Fatal(err)
	}
	score(t, pool, week44, newUser(t, pool, "solo"), 100, friday)

	later := at(pool, friday.AddDate(0, 0, 7))
	const servers = 6
	finalized := make([][]string, servers)
	errs := make([]error, servers)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range servers {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; finalized[i], errs[i] = later.Rollover(ctx) }()
	}
	close(start)
	wg.Wait()

	total := 0
	for i := range servers {
		if errs[i] != nil {
			t.Fatalf("server %d: %v", i, errs[i])
		}
		total += len(finalized[i])
	}
	if total != 1 {
		t.Fatalf("season finalized %d times, want 1 (%v)", total, finalized)
	}
	if got := results(t, pool, week44); !slices.Equal(got, []string{"solo"}) {
		t.Fatalf("standings %v", got)
	}
}

func TestRunStopsWithItsContext(t *testing.T) {
	pool := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { at(pool, friday).Run(ctx, time.Hour); close(stopped) }()

	// The first rollover runs immediately, without waiting for a tick.
	deadline := time.Now().Add(10 * time.Second)
	for {
		if _, err := store.New(pool).GetSeason(context.Background(), week44); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("Run didn't roll over on start")
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("Run didn't stop")
	}
}

func points(t *testing.T, pool *pgxpool.Pool, season string, user uuid.UUID) int {
	t.Helper()
	p, err := store.New(pool).GetSeasonPoints(context.Background(), store.GetSeasonPointsParams{SeasonID: season, UserID: user})
	if errors.Is(err, pgx.ErrNoRows) {
		return 0
	}
	if err != nil {
		t.Fatal(err)
	}
	return int(p)
}

func TestAddPointsAccumulatesPerWeek(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	q := store.New(pool)
	user := newUser(t, pool, "scorer")

	for _, p := range []int{50, 0, 25} { // 0 points (nothing earned) adds nothing
		if _, _, err := seasons.AddPoints(ctx, q, user, friday, p); err != nil {
			t.Fatal(err)
		}
	}
	monday := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	s, added, err := seasons.AddPoints(ctx, q, user, monday, 10)
	if err != nil || !added || s.ID != "2026-W45" {
		t.Fatalf("monday: %+v %v %v", s, added, err)
	}
	if got := points(t, pool, week44, user); got != 75 {
		t.Fatalf("week 44 points = %d, want 75", got)
	}
	if got := points(t, pool, "2026-W45", user); got != 10 {
		t.Fatalf("week 45 points = %d, want 10", got)
	}
	var scoredAt time.Time
	if err := pool.QueryRow(ctx, "SELECT updated_at FROM season_points WHERE season_id = $1 AND user_id = $2", week44, user).Scan(&scoredAt); err != nil || !scoredAt.Equal(friday) {
		t.Fatalf("updated_at = %v (%v), want the last time points were added", scoredAt, err)
	}
}

func TestAddPointsSkipsAFrozenSeason(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "latecomer")
	if _, err := at(pool, friday).Rollover(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := at(pool, friday.AddDate(0, 0, 7)).Rollover(ctx); err != nil { // freezes week 44
		t.Fatal(err)
	}
	_, added, err := seasons.AddPoints(ctx, store.New(pool), user, friday, 100)
	if err != nil || added {
		t.Fatalf("added = %v (%v), want points refused for a frozen season", added, err)
	}
	if got := points(t, pool, week44, user); got != 0 {
		t.Fatalf("frozen season got %d points", got)
	}
}

// A claim at Sunday 23:59:59 whose transaction is still open when the freeze
// starts: the freeze waits for it, and its points are in the final standings.
func TestFreezeWaitsForPointsBeingAdded(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "lastsecond")
	if _, err := at(pool, friday).Rollover(ctx); err != nil {
		t.Fatal(err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	lastSecond := time.Date(2026, 11, 1, 23, 59, 59, 0, time.UTC)
	if _, added, err := seasons.AddPoints(ctx, store.New(tx), user, lastSecond, 60); err != nil || !added {
		t.Fatalf("add: %v %v", added, err)
	}

	frozen := make(chan []string, 1)
	go func() {
		done, err := at(pool, lastSecond.Add(game.FinalizeGrace+time.Second)).Rollover(ctx)
		if err != nil {
			t.Error(err)
		}
		frozen <- done
	}()
	select {
	case done := <-frozen:
		t.Fatalf("froze %v while points were still being added", done)
	case <-time.After(500 * time.Millisecond):
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if done := <-frozen; !slices.Equal(done, []string{week44}) {
		t.Fatalf("froze %v", done)
	}
	if got := results(t, pool, week44); !slices.Equal(got, []string{"lastsecond"}) {
		t.Fatalf("standings %v: the last-second points are missing", got)
	}
}
