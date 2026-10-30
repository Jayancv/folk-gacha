package httpapi

import (
	"context"
	"testing"
	"time"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/game"
	"cardgame/server/internal/leaderboard"
	"cardgame/server/internal/seasons"
	"cardgame/server/internal/store"
)

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set).
func TestLeaderboardOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, seasons, season_points, season_results CASCADE"); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{
		Auth:        auth.NewService(store.New(pool)),
		Leaderboard: leaderboard.NewService(pool),
	}, AuthOptions{DevLogin: true}).Handler(nil)}

	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"climber"}`, nil)
	cookie := sessionFrom(t, signIn)
	me := decode[Me](t, signIn)
	now := time.Now()
	if _, _, err := seasons.AddPoints(ctx, store.New(pool), me.Id, now, 120); err != nil {
		t.Fatal(err)
	}

	// Public: no cookie needed, and no "you".
	rec := ts.do(t, "GET", "/leaderboard/current", "", nil)
	if rec.Code != 200 {
		t.Fatalf("signed out: %d %s", rec.Code, rec.Body)
	}
	b := decode[Leaderboard](t, rec)
	week := game.SeasonFor(now)
	if b.Season.Id != week.ID || !b.Season.StartsAt.Equal(week.StartsAt) || b.Final || b.Players != 1 || b.You != nil {
		t.Fatalf("signed-out board %+v", b)
	}
	if len(b.Top) != 1 || b.Top[0] != (LeaderboardEntry{Rank: 1, Username: "climber", Points: 120}) {
		t.Fatalf("top %+v", b.Top)
	}

	// Signed in: your own standing, with your name.
	b = decode[Leaderboard](t, ts.do(t, "GET", "/leaderboard/current", "", cookie))
	if b.You == nil || *b.You != (LeaderboardEntry{Rank: 1, Username: "climber", Points: 120}) {
		t.Fatalf("you = %+v", b.You)
	}

	// By id: this week, then unknown weeks.
	if rec := ts.do(t, "GET", "/leaderboard/"+week.ID, "", nil); rec.Code != 200 || decode[Leaderboard](t, rec).Season.Id != week.ID {
		t.Fatalf("by id: %d %s", rec.Code, rec.Body)
	}
	for _, id := range []string{"2001-W01", "not-a-week"} {
		rec := ts.do(t, "GET", "/leaderboard/"+id, "", nil)
		if rec.Code != 404 || decode[Error](t, rec).Error != "not_found" {
			t.Errorf("%s: %d %s", id, rec.Code, rec.Body)
		}
	}
}
