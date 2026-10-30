package httpapi

import (
	"context"
	"testing"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/packs"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

func TestClaimNeedsSignIn(t *testing.T) {
	rec := newTestServer(AuthOptions{DevLogin: true}).do(t, "POST", "/packs/daily/claim", "", nil)
	if rec.Code != 401 {
		t.Fatalf("signed out: %d %s", rec.Code, rec.Body)
	}
}

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set): sign in,
// claim, see the status on /me, and get 409 on a second claim.
func TestDailyClaimOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, daily_claims CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{Auth: auth.NewService(store.New(pool)), Packs: packs.NewService(pool)}, AuthOptions{DevLogin: true}).Handler(nil)}

	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"asha"}`, nil)
	if signIn.Code != 200 {
		t.Fatalf("sign in: %d %s", signIn.Code, signIn.Body)
	}
	if me := decode[Me](t, signIn); me.DailyPack == nil || !me.DailyPack.Ready {
		t.Fatalf("new player should have a pack ready: %+v", me.DailyPack)
	}
	cookie := sessionFrom(t, signIn)

	rec := ts.do(t, "POST", "/packs/daily/claim", "", cookie)
	if rec.Code != 200 {
		t.Fatalf("claim: %d %s", rec.Code, rec.Body)
	}
	pack := decode[DailyPack](t, rec)
	if len(pack.Cards) != 5 || pack.NextResetAt.Hour() != 0 || pack.NextResetAt.Location().String() != "UTC" {
		t.Fatalf("pack = %+v", pack)
	}
	for _, c := range pack.Cards {
		if c.Traits.Visual.Effect == "" || c.Traits.Pattern == "" || c.Score <= 0 || c.SetSize != 1500 || !c.Rarity.Valid() || !c.Element.Valid() {
			t.Fatalf("card missing fields: %+v", c)
		}
	}

	me := decode[Me](t, ts.do(t, "GET", "/me", "", cookie))
	if me.DailyPack == nil || me.DailyPack.Ready || !me.DailyPack.NextResetAt.Equal(pack.NextResetAt) {
		t.Fatalf("after claim: %+v", me.DailyPack)
	}

	again := ts.do(t, "POST", "/packs/daily/claim", "", cookie)
	if again.Code != 409 || decode[Error](t, again).Error != "already_claimed" {
		t.Fatalf("second claim: %d %s", again.Code, again.Body)
	}
}
