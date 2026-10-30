package httpapi

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/profile"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set).
func TestProfileOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, showcase_cards CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{Auth: auth.NewService(store.New(pool)), Profiles: profile.NewService(pool)}, AuthOptions{DevLogin: true}).Handler(nil)}

	if rec := ts.do(t, "GET", "/users/anyone", "", nil); rec.Code != 401 {
		t.Fatalf("signed out: %d", rec.Code)
	}
	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"shower"}`, nil)
	cookie := sessionFrom(t, signIn)
	me := decode[Me](t, signIn)
	var cards []uuid.UUID
	rows, err := pool.Query(ctx, `INSERT INTO cards (season_card_id, copy_no, owner_id, acquired_via)
		SELECT id, 1, $1, 'pack' FROM season_cards WHERE set_no IN (1, 1200, 1500) RETURNING id`, me.Id)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id uuid.UUID
		_ = rows.Scan(&id)
		cards = append(cards, id)
	}
	rows.Close()

	p := decode[Profile](t, ts.do(t, "GET", "/users/SHOWER", "", cookie))
	if p.Username != "shower" || p.CardCount != 3 || p.CollectionPower <= 0 || len(p.Showcase) != 3 || p.ShowcaseChosen {
		t.Fatalf("profile %+v", p)
	}

	rec := ts.do(t, "PUT", "/me/showcase", fmt.Sprintf(`{"cardIds":[%q]}`, cards[2]), cookie)
	if rec.Code != 200 {
		t.Fatalf("set showcase: %d %s", rec.Code, rec.Body)
	}
	if p := decode[Profile](t, rec); !p.ShowcaseChosen || len(p.Showcase) != 1 || p.Showcase[0].Id != cards[2] {
		t.Fatalf("after set: %+v", p.Showcase)
	}
	if rec := ts.do(t, "PUT", "/me/showcase", fmt.Sprintf(`{"cardIds":[%q]}`, uuid.New()), cookie); rec.Code != 400 || decode[Error](t, rec).Error != "not_owned" {
		t.Fatalf("not owned: %d %s", rec.Code, rec.Body)
	}
	if rec := ts.do(t, "GET", "/users/nobody_here", "", cookie); rec.Code != 404 {
		t.Fatalf("unknown: %d", rec.Code)
	}
}
