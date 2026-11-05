package httpapi

import (
	"context"
	"testing"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/leaderboard"
	"cardgame/server/internal/profile"
	"cardgame/server/internal/store"
)

// A chosen name shows on the profile, /me and the leaderboard; the Google name never does.
func TestPublicNameOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, seasons, season_points, season_results CASCADE"); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{
		Auth:        auth.NewService(store.New(pool)),
		Profiles:    profile.NewService(pool),
		Leaderboard: leaderboard.NewService(pool),
	}, AuthOptions{DevLogin: true}).Handler(nil)}

	if rec := ts.do(t, "PUT", "/me/name", `{"name":"Asha"}`, nil); rec.Code != 401 {
		t.Fatalf("signed out: %d", rec.Code)
	}
	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"asha"}`, nil)
	cookie := sessionFrom(t, signIn)
	me := decode[Me](t, signIn)
	if me.PublicName != nil {
		t.Fatalf("new player has a name: %q", *me.PublicName)
	}
	// A Google name is stored but private.
	if _, err := pool.Exec(ctx, "UPDATE users SET display_name = 'Asha Perera' WHERE id = $1", me.Id); err != nil {
		t.Fatal(err)
	}

	rec := ts.do(t, "PUT", "/me/name", `{"name":"  Asha   the Brave "}`, cookie)
	if rec.Code != 200 {
		t.Fatalf("set name: %d %s", rec.Code, rec.Body)
	}
	if p := decode[Profile](t, rec); p.Name == nil || *p.Name != "Asha the Brave" || p.Username != "asha" {
		t.Fatalf("profile after set: %+v", p)
	}
	if got := decode[Me](t, ts.do(t, "GET", "/me", "", cookie)); got.PublicName == nil || *got.PublicName != "Asha the Brave" {
		t.Fatalf("/me name: %v", got.PublicName)
	}

	for _, bad := range []string{`{"name":"@x"}`, `{"name":"a"}`, `{"name":"asha 🐉"}`} {
		if rec := ts.do(t, "PUT", "/me/name", bad, cookie); rec.Code != 400 || decode[Error](t, rec).Error != "bad_name" {
			t.Errorf("%s: %d %s", bad, rec.Code, rec.Body)
		}
	}

	// Another player sees the chosen name on the board, not the Google name.
	if _, err := pool.Exec(ctx, `INSERT INTO seasons (id, starts_at, ends_at) VALUES ('2026-W45', '2026-11-02', '2026-11-09');
		INSERT INTO season_points (season_id, user_id, points, updated_at) SELECT '2026-W45', id, 50, now() FROM users WHERE username = 'asha'`); err != nil {
		t.Fatal(err)
	}
	other := sessionFrom(t, ts.do(t, "POST", "/auth/dev", `{"name":"ben"}`, nil))
	board := decode[Leaderboard](t, ts.do(t, "GET", "/leaderboard/2026-W45", "", other))
	if len(board.Top) != 1 || board.Top[0].Name == nil || *board.Top[0].Name != "Asha the Brave" {
		t.Fatalf("board %+v", board.Top)
	}
	if p := decode[Profile](t, ts.do(t, "GET", "/users/asha", "", other)); p.DisplayName != nil || p.Name == nil {
		t.Fatalf("other's view: %+v", p)
	}

	// An empty name goes back to the username.
	if p := decode[Profile](t, ts.do(t, "PUT", "/me/name", `{"name":""}`, cookie)); p.Name != nil {
		t.Fatalf("cleared: %v", *p.Name)
	}
}
