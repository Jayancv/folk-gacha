package httpapi

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/merges"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

func TestMergeNeedsSignIn(t *testing.T) {
	ts := newTestServer(AuthOptions{DevLogin: true})
	body := fmt.Sprintf(`{"cardIds":["%s","%s"]}`, uuid.New(), uuid.New())
	if rec := ts.do(t, "POST", "/merges", body, nil); rec.Code != 401 {
		t.Fatalf("merge signed out: %d %s", rec.Code, rec.Body)
	}
	if rec := ts.do(t, "GET", "/recipes", "", nil); rec.Code != 401 {
		t.Fatalf("recipes signed out: %d %s", rec.Code, rec.Body)
	}
}

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set).
func TestMergeOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, daily_claims, discovered_recipes CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{Auth: auth.NewService(store.New(pool)), Merges: merges.NewService(pool)}, AuthOptions{DevLogin: true}).Handler(nil)}
	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"merger"}`, nil)
	if signIn.Code != 200 {
		t.Fatalf("sign in: %d %s", signIn.Code, signIn.Body)
	}
	cookie := sessionFrom(t, signIn)
	user := decode[Me](t, signIn).Id

	// give mints the first season card of a spirit for the player.
	give := func(template string) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		err := pool.QueryRow(ctx, `WITH sc AS (
				UPDATE season_cards SET minted = minted + 1
				WHERE id = (SELECT min(id) FROM season_cards WHERE template_id = $1) RETURNING id, minted)
			INSERT INTO cards (season_card_id, copy_no, owner_id, acquired_via)
			SELECT id, minted, $2, 'pack' FROM sc RETURNING id`, template, user).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	merge := func(a, b uuid.UUID) (int, string) {
		t.Helper()
		rec := ts.do(t, "POST", "/merges", fmt.Sprintf(`{"cardIds":["%s","%s"]}`, a, b), cookie)
		if rec.Code != 200 {
			return rec.Code, decode[Error](t, rec).Error
		}
		return 200, rec.Body.String()
	}

	calf1, calf2 := give("gaja-calf"), give("gaja-calf")
	rec := ts.do(t, "POST", "/merges", fmt.Sprintf(`{"cardIds":["%s","%s"]}`, calf1, calf2), cookie)
	if rec.Code != 200 {
		t.Fatalf("level up: %d %s", rec.Code, rec.Body)
	}
	up := decode[MergeResult](t, rec)
	if up.Kind != LevelUp || up.Card.Level != 2 || up.Card.AcquiredVia != "merge" || up.Discovered {
		t.Fatalf("level up result %+v", up)
	}

	simha := give("simha")
	rec = ts.do(t, "POST", "/merges", fmt.Sprintf(`{"cardIds":["%s","%s"]}`, simha, up.Card.Id), cookie)
	if rec.Code != 200 {
		t.Fatalf("recipe: %d %s", rec.Code, rec.Body)
	}
	made := decode[MergeResult](t, rec)
	if made.Kind != Recipe || !made.Discovered || made.Card.TemplateId != "gajasinghe" || made.Card.Level != 1 {
		t.Fatalf("recipe result %+v", made)
	}
	book := decode[struct{ Recipes []DiscoveredRecipe }](t, ts.do(t, "GET", "/recipes", "", cookie))
	if len(book.Recipes) != 1 || book.Recipes[0].Output != "gajasinghe" || book.Recipes[0].Inputs[0] != "gaja-calf" {
		t.Fatalf("recipes %+v", book)
	}

	malu := give("malu")
	tests := []struct {
		name string
		a, b uuid.UUID
		code int
		err  string
	}{
		{"no recipe", malu, made.Card.Id, 409, "no_recipe"},
		{"same card", malu, malu, 400, "same_card"},
		{"used-up card", calf1, malu, 404, "not_owned"},
	}
	for _, tt := range tests {
		if code, errCode := merge(tt.a, tt.b); code != tt.code || errCode != tt.err {
			t.Errorf("%s: %d %s, want %d %s", tt.name, code, errCode, tt.code, tt.err)
		}
	}
	if rec := ts.do(t, "POST", "/merges", fmt.Sprintf(`{"cardIds":["%s"]}`, malu), cookie); rec.Code != 400 {
		t.Errorf("one card id: %d %s", rec.Code, rec.Body)
	}
}
