package httpapi

import (
	"context"
	"testing"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/collection"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

func TestListCardsNeedsSignIn(t *testing.T) {
	if rec := newTestServer(AuthOptions{}).do(t, "GET", "/cards", "", nil); rec.Code != 401 {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set).
func TestListCardsOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, daily_claims, discovered_recipes CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{Auth: auth.NewService(store.New(pool)), Collection: collection.NewService(pool)}, AuthOptions{DevLogin: true}).Handler(nil)}
	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"collector"}`, nil)
	cookie := sessionFrom(t, signIn)
	user := decode[Me](t, signIn).Id

	// One card of each rarity's first season card.
	if _, err := pool.Exec(ctx, `INSERT INTO cards (season_card_id, copy_no, owner_id, acquired_via)
		SELECT min(id), 1, $1, 'pack' FROM season_cards GROUP BY rarity`, user); err != nil {
		t.Fatal(err)
	}

	page := decode[CardPage](t, ts.do(t, "GET", "/cards?limit=2", "", cookie))
	if len(page.Cards) != 2 || page.Total != 5 || page.NextOffset == nil || *page.NextOffset != 2 {
		t.Fatalf("first page: %d cards, total %d, next %v", len(page.Cards), page.Total, page.NextOffset)
	}
	page = decode[CardPage](t, ts.do(t, "GET", "/cards?rarity=epic&rarity=legendary&sort=score", "", cookie))
	if len(page.Cards) != 2 || page.Cards[0].Rarity != Legendary || page.Cards[1].Rarity != Epic || page.NextOffset != nil {
		t.Fatalf("filtered: %+v", page)
	}

	for _, q := range []string{"element=lava", "rarity=mythic", "sort=random", "level=9", "limit=500"} {
		if rec := ts.do(t, "GET", "/cards?"+q, "", cookie); rec.Code != 400 {
			t.Errorf("%s: %d %s", q, rec.Code, rec.Body)
		}
	}
}
