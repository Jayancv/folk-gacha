package seeding_test

import (
	"context"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

func emptyCatalog(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := dbtest.Pool(t)
	if _, err := pool.Exec(context.Background(), "TRUNCATE card_templates, card_seasons, season_cards, merge_recipes CASCADE"); err != nil {
		t.Fatal(err)
	}
	return pool
}

func count(t *testing.T, pool *pgxpool.Pool, table string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

var real = seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}

func TestSeedLoadsCatalogAndRecipes(t *testing.T) {
	pool := emptyCatalog(t)
	ctx := context.Background()

	res, err := seeding.Run(ctx, pool, real)
	if err != nil {
		t.Fatal(err)
	}
	if res.Seasons["s1"] != 1500 || res.Recipes != 2 {
		t.Fatalf("result = %+v, want s1: 1500 cards and 2 recipes", res)
	}
	if n := count(t, pool, "card_templates"); n != 12 {
		t.Fatalf("templates = %d, want 12", n)
	}

	recipes, err := store.New(pool).ListRecipes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, r := range recipes {
		got = append(got, r.InputA+"+"+r.InputB+"="+r.OutputTemplateID)
	}
	if strings.Join(got, " ") != "gaja-calf+simha=gajasinghe monara+simha=serapendiya" {
		t.Fatalf("recipes = %v", got)
	}

	// Copy limits from the generator made it into the database.
	var limited, legendaryCap int
	if err := pool.QueryRow(ctx, `SELECT count(*) FILTER (WHERE max_copies IS NOT NULL),
		max(max_copies) FILTER (WHERE rarity = 'legendary') FROM season_cards`).Scan(&limited, &legendaryCap); err != nil {
		t.Fatal(err)
	}
	if limited != 75 || legendaryCap != 25 {
		t.Fatalf("limited cards = %d (want 60 epic + 15 legendary), legendary cap = %d", limited, legendaryCap)
	}
}

func TestSeedIsSafeToRunAgain(t *testing.T) {
	pool := emptyCatalog(t)
	ctx := context.Background()
	if _, err := seeding.Run(ctx, pool, real); err != nil {
		t.Fatal(err)
	}
	before, _ := store.New(pool).ListRecipes(ctx)

	// Simulate pulls, then seed again: minted counts must survive.
	if _, err := pool.Exec(ctx, "UPDATE season_cards SET minted = 3 WHERE id = 's1-1500'"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, real); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, "season_cards"); n != 1500 {
		t.Fatalf("cards after re-seed = %d", n)
	}
	var minted int
	if err := pool.QueryRow(ctx, "SELECT minted FROM season_cards WHERE id = 's1-1500'").Scan(&minted); err != nil || minted != 3 {
		t.Fatalf("re-seeding reset minted to %d (%v)", minted, err)
	}
	after, _ := store.New(pool).ListRecipes(ctx)
	if len(after) != len(before) || after[0].ID != before[0].ID {
		t.Fatalf("recipes changed identity: %v -> %v", before, after)
	}
}

func TestSeedUpdatesARecipeOutputInPlace(t *testing.T) {
	pool := emptyCatalog(t)
	ctx := context.Background()
	if _, err := seeding.Run(ctx, pool, real); err != nil {
		t.Fatal(err)
	}
	before, _ := store.New(pool).ListRecipes(ctx)

	tuned := seeding.Sources{Seasons: fstest.MapFS{}, Recipes: []byte(`{"recipes":[
		{"inputs":["simha","gaja-calf"],"output":"makara"}]}`)}
	if _, err := seeding.Run(ctx, pool, tuned); err != nil {
		t.Fatal(err)
	}
	after, _ := store.New(pool).ListRecipes(ctx)
	if after[0].ID != before[0].ID || after[0].OutputTemplateID != "makara" {
		t.Fatalf("want same recipe id with new output: %v -> %v", before[0], after[0])
	}
}

func TestBadRecipesChangeNothing(t *testing.T) {
	pool := emptyCatalog(t)
	ctx := context.Background()
	if _, err := seeding.Run(ctx, pool, real); err != nil {
		t.Fatal(err)
	}

	bad := seeding.Sources{Seasons: fstest.MapFS{}, Recipes: []byte(`{"recipes":[
		{"inputs":["gaja-calf","simha"],"output":"makara"},
		{"inputs":["malu","dragon"],"output":"makara"}]}`)}
	_, err := seeding.Run(ctx, pool, bad)
	if err == nil || !strings.Contains(err.Error(), `unknown template "dragon"`) {
		t.Fatalf("err = %v", err)
	}
	recipes, _ := store.New(pool).ListRecipes(ctx)
	if recipes[0].OutputTemplateID != "gajasinghe" {
		t.Fatal("a rejected recipes file must not change any recipe")
	}
}

func TestDatabaseRejectsUnsortedRecipes(t *testing.T) {
	pool := emptyCatalog(t)
	ctx := context.Background()
	if _, err := seeding.Run(ctx, pool, real); err != nil {
		t.Fatal(err)
	}
	// The CHECK keeps (b, a) from sneaking in next to (a, b), even outside cmd/seed.
	_, err := pool.Exec(ctx, "INSERT INTO merge_recipes (input_a, input_b, output_template_id) VALUES ('simha', 'gaja-calf', 'makara')")
	if err == nil {
		t.Fatal("unsorted recipe accepted")
	}
	_, err = pool.Exec(ctx, "INSERT INTO merge_recipes (input_a, input_b, output_template_id) VALUES ('malu', 'malu', 'makara')")
	if err == nil {
		t.Fatal("same-spirit recipe accepted")
	}
}
