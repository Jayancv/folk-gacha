package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/game"
	"cardgame/server/internal/merges"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/internal/tournaments"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

func TestTournamentsNeedSignIn(t *testing.T) {
	ts := newTestServer(AuthOptions{DevLogin: true})
	lineup := fmt.Sprintf(`{"cardIds":["%s"]}`, uuid.New())
	for _, r := range []struct{ method, path, body string }{
		{"GET", "/tournaments", ""},
		{"GET", "/tournaments/daily-2026-11-04", ""},
		{"PUT", "/tournaments/daily-2026-11-04/entry", lineup},
		{"DELETE", "/tournaments/daily-2026-11-04/entry", ""},
		{"POST", "/tournaments/daily-2026-11-04/preview", lineup},
	} {
		if rec := ts.do(t, r.method, r.path, r.body, nil); rec.Code != 401 {
			t.Errorf("%s %s signed out: %d %s", r.method, r.path, rec.Code, rec.Body)
		}
	}
}

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set).
func TestTournamentOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, trades, tournaments, daily_claims, discovered_recipes CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	r, err := game.ParseTournamentRules([]byte(`
series:
  - { id: daily, name: Daily Cup, cadence: daily, entryHours: 20, formats: [trial] }
formats:
  trial: { kind: element-trial, name: Element Trial, slots: 3, elementMultiplier: 2 }
`))
	if err != nil {
		t.Fatal(err)
	}
	old := game.CurrentTournamentRules()
	game.UseTournamentRules(r)
	t.Cleanup(func() { game.UseTournamentRules(old) })

	clock := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	svc := tournaments.NewService(pool)
	svc.Now = func() time.Time { return clock }
	ts := testServer{h: NewServer(pool, Services{
		Auth:        auth.NewService(store.New(pool)),
		Merges:      merges.NewService(pool),
		Tournaments: svc,
	}, AuthOptions{DevLogin: true}).Handler(nil)}

	signIn := func(name string) (*http.Cookie, uuid.UUID) {
		t.Helper()
		rec := ts.do(t, "POST", "/auth/dev", fmt.Sprintf(`{"name":%q}`, name), nil)
		if rec.Code != 200 {
			t.Fatalf("sign in %s: %d %s", name, rec.Code, rec.Body)
		}
		return sessionFrom(t, rec), decode[Me](t, rec).Id
	}
	cookie, asha := signIn("asha")
	give := func(template string) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		err := pool.QueryRow(ctx, `WITH sc AS (
				UPDATE season_cards SET minted = minted + 1
				WHERE id = (SELECT min(id) FROM season_cards WHERE template_id = $1) RETURNING id, minted)
			INSERT INTO cards (season_card_id, copy_no, owner_id, acquired_via)
			SELECT id, minted, $2, 'pack' FROM sc RETURNING id`, template, asha).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	a, b, c, d := give("gaja-calf"), give("gaja-calf"), give("malu"), give("monara")

	rec := ts.do(t, "GET", "/tournaments", "", cookie)
	if rec.Code != 200 {
		t.Fatalf("list: %d %s", rec.Code, rec.Body)
	}
	list := decode[TournamentList](t, rec)
	if len(list.Tournaments) != 1 || len(list.Upcoming) != 1 {
		t.Fatalf("list %+v", list)
	}
	today := list.Tournaments[0]
	if today.Id != "daily-2026-11-04" || today.Status != "open" || today.Format.Kind != "element-trial" ||
		today.Element == nil || today.Format.ElementMultiplier == nil || today.SeedHash == nil || today.Seed != nil || today.Entered {
		t.Fatalf("today %+v", today)
	}
	if up := list.Upcoming[0]; up.Id != "daily-2026-11-05" || up.Status != "upcoming" || up.SeedHash != nil {
		t.Errorf("upcoming %+v", up)
	}

	lineup := fmt.Sprintf(`{"cardIds":["%s","%s","%s"]}`, a, c, d)
	path := "/tournaments/" + today.Id
	rec = ts.do(t, "POST", path+"/preview", lineup, cookie)
	if rec.Code != 200 {
		t.Fatalf("preview: %d %s", rec.Code, rec.Body)
	}
	preview := decode[LineupScore](t, rec)
	if len(preview.Cards) != 3 || preview.Total == 0 {
		t.Fatalf("preview %+v", preview)
	}

	rec = ts.do(t, "PUT", path+"/entry", lineup, cookie)
	if rec.Code != 200 {
		t.Fatalf("enter: %d %s", rec.Code, rec.Body)
	}
	entry := decode[TournamentEntry](t, rec)
	if len(entry.Cards) != 3 || entry.Cards[0].Card == nil || !entry.Cards[0].Card.InTournament || entry.Score.Total != preview.Total {
		t.Fatalf("entry %+v", entry)
	}

	// The entered card is locked.
	merge := ts.do(t, "POST", "/merges", fmt.Sprintf(`{"cardIds":["%s","%s"]}`, b, a), cookie)
	if merge.Code != 409 || decode[Error](t, merge).Error != "in_tournament" {
		t.Fatalf("merge an entered card: %d %s", merge.Code, merge.Body)
	}
	for _, x := range []struct {
		body string
		code int
		err  string
	}{
		{fmt.Sprintf(`{"cardIds":["%s","%s"]}`, a, c), 400, "bad_lineup"},
		{fmt.Sprintf(`{"cardIds":["%s","%s","%s"]}`, a, a, c), 400, "bad_lineup"},
		{fmt.Sprintf(`{"cardIds":["%s","%s","%s"]}`, a, c, uuid.New()), 409, "not_owned"},
	} {
		rec := ts.do(t, "PUT", path+"/entry", x.body, cookie)
		if rec.Code != x.code || decode[Error](t, rec).Error != x.err {
			t.Errorf("%s: %d %s, want %d %s", x.body, rec.Code, rec.Body, x.code, x.err)
		}
	}
	if rec := ts.do(t, "PUT", "/tournaments/daily-1999-01-01/entry", lineup, cookie); rec.Code != 404 {
		t.Errorf("unknown tournament: %d", rec.Code)
	}

	rec = ts.do(t, "GET", path, "", cookie)
	if rec.Code != 200 {
		t.Fatalf("detail: %d %s", rec.Code, rec.Body)
	}
	if det := decode[TournamentDetail](t, rec); !det.Tournament.Entered || det.You == nil || det.Tournament.Entries != 1 || len(det.Results) != 0 {
		t.Fatalf("detail %+v", det)
	}

	// Entries close; results and the seed show.
	clock = time.Date(2026, 11, 4, 20, 0, 0, 0, time.UTC)
	if _, _, err := svc.Step(ctx); err != nil {
		t.Fatal(err)
	}
	if rec := ts.do(t, "DELETE", path+"/entry", "", cookie); rec.Code != 409 || decode[Error](t, rec).Error != "closed" {
		t.Errorf("withdraw after close: %d %s", rec.Code, rec.Body)
	}
	rec = ts.do(t, "GET", path, "", cookie)
	det := decode[TournamentDetail](t, rec)
	if det.Tournament.Status != "locked" || det.Tournament.Seed == nil || len(det.Results) != 1 ||
		det.Results[0].Username != "asha" || det.You == nil || det.You.Rank == nil || *det.You.Rank != 1 {
		t.Fatalf("after close %+v", det)
	}
	if rec := ts.do(t, "GET", "/tournaments/nope", "", cookie); rec.Code != 404 {
		t.Errorf("unknown detail: %d", rec.Code)
	}
}

func TestWithdrawOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, tournaments CASCADE"); err != nil {
		t.Fatal(err)
	}
	svc := tournaments.NewService(pool)
	svc.Now = func() time.Time { return time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC) }
	ts := testServer{h: NewServer(pool, Services{Auth: auth.NewService(store.New(pool)), Tournaments: svc}, AuthOptions{DevLogin: true}).Handler(nil)}
	rec := ts.do(t, "POST", "/auth/dev", `{"name":"asha"}`, nil)
	cookie := sessionFrom(t, rec)
	if rec := ts.do(t, "DELETE", "/tournaments/daily-2026-11-04/entry", "", cookie); rec.Code != 404 || decode[Error](t, rec).Error != "not_entered" {
		t.Errorf("withdraw without entry: %d %s", rec.Code, rec.Body)
	}
}
