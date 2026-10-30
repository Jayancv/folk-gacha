package profile_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/game"
	"cardgame/server/internal/profile"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

func setup(t *testing.T) (*pgxpool.Pool, *profile.Service) {
	t.Helper()
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, showcase_cards, discovered_recipes, seasons, season_points, season_results CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE season_cards SET minted = 0"); err != nil {
		t.Fatal(err)
	}
	return pool, profile.NewService(pool)
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) store.User {
	t.Helper()
	u, err := store.New(pool).CreateUser(context.Background(), store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// give mints the nth season card of a rarity for the player at a level.
func give(t *testing.T, pool *pgxpool.Pool, owner uuid.UUID, rarity string, nth, level int) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(), `WITH sc AS (
			UPDATE season_cards SET minted = minted + 1
			WHERE id = (SELECT id FROM season_cards WHERE rarity = $1 ORDER BY id OFFSET $2 LIMIT 1) RETURNING id, minted)
		INSERT INTO cards (season_card_id, copy_no, owner_id, level, acquired_via)
		SELECT id, minted, $3, $4, 'pack' FROM sc RETURNING id`, rarity, nth, owner, level).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func ids(p profile.Profile) []uuid.UUID {
	out := make([]uuid.UUID, len(p.Showcase))
	for i, c := range p.Showcase {
		out[i] = c.ID
	}
	return out
}

func same(a, b []uuid.UUID) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestProfileStats(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	u := newUser(t, pool, "collector")

	// 12 cards, so only the best 10 count towards power.
	var scores []int
	for i := range 8 {
		give(t, pool, u.ID, "common", i, 1+i%3)
	}
	give(t, pool, u.ID, "rare", 0, 2)
	give(t, pool, u.ID, "epic", 0, 1)
	give(t, pool, u.ID, "legendary", 0, 4)
	give(t, pool, u.ID, "uncommon", 0, 1)
	rows, err := pool.Query(ctx, `SELECT sc.score, c.level FROM cards c JOIN season_cards sc ON sc.id = c.season_card_id WHERE c.owner_id = $1`, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var score, level int
		_ = rows.Scan(&score, &level)
		scores = append(scores, game.LevelScore(score, level))
	}
	rows.Close()

	if _, err := pool.Exec(ctx, `INSERT INTO discovered_recipes (user_id, recipe_id) SELECT $1, id FROM merge_recipes`, u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO seasons (id, starts_at, ends_at) VALUES
		('2026-W43', '2026-10-19', '2026-10-26'), ('2026-W44', '2026-10-26', '2026-11-02'), ('2026-W45', '2026-11-02', '2026-11-09')`); err != nil {
		t.Fatal(err)
	}
	// Finished 1st and 3rd (podiums) and 4th (not).
	if _, err := pool.Exec(ctx, `INSERT INTO season_results (season_id, user_id, rank, points) VALUES
		('2026-W43', $1, 1, 900), ('2026-W44', $1, 3, 500), ('2026-W45', $1, 4, 400)`, u.ID); err != nil {
		t.Fatal(err)
	}

	p, err := svc.Get(ctx, "COLLECTOR") // usernames are case-insensitive
	if err != nil {
		t.Fatal(err)
	}
	if p.User.ID != u.ID || p.CardCount != 12 || p.Recipes != 2 || p.Podiums != 2 {
		t.Fatalf("stats: cards %d, recipes %d, podiums %d", p.CardCount, p.Recipes, p.Podiums)
	}
	// The database's power matches the game rule exactly (same rounding, best 10 only).
	if want := game.CollectionPower(scores); p.CollectionPower != want {
		t.Fatalf("collection power = %d, want %d", p.CollectionPower, want)
	}
}

func TestShowcaseDefaultsToBestCardsUntilChosen(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	u := newUser(t, pool, "picker")
	common := give(t, pool, u.ID, "common", 0, 1)
	legendary := give(t, pool, u.ID, "legendary", 0, 1)
	rare := give(t, pool, u.ID, "rare", 0, 1)
	epic := give(t, pool, u.ID, "epic", 0, 1)

	p, err := svc.Get(ctx, "picker")
	if err != nil {
		t.Fatal(err)
	}
	if p.Chosen || !same(ids(p), []uuid.UUID{legendary, epic, rare, common}) {
		t.Fatalf("default showcase %v (chosen %v)", ids(p), p.Chosen)
	}

	// The player's own pick and order.
	p, err = svc.SetShowcase(ctx, u, []uuid.UUID{common, rare})
	if err != nil {
		t.Fatal(err)
	}
	if !p.Chosen || !same(ids(p), []uuid.UUID{common, rare}) {
		t.Fatalf("chosen showcase %v", ids(p))
	}
	// Reorder by saving again.
	if p, _ = svc.SetShowcase(ctx, u, []uuid.UUID{rare, common}); !same(ids(p), []uuid.UUID{rare, common}) {
		t.Fatalf("reordered %v", ids(p))
	}
	// An empty pick goes back to the best cards.
	if p, _ = svc.SetShowcase(ctx, u, nil); p.Chosen || len(p.Showcase) != 4 {
		t.Fatalf("after clearing: chosen %v, %d cards", p.Chosen, len(p.Showcase))
	}
}

func TestShowcaseRules(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	u, other := newUser(t, pool, "owner"), newUser(t, pool, "someone")
	mine := make([]uuid.UUID, 6)
	for i := range mine {
		mine[i] = give(t, pool, u.ID, "common", i, 1)
	}
	theirs := give(t, pool, other.ID, "rare", 0, 1)
	if _, err := svc.SetShowcase(ctx, u, mine[:2]); err != nil {
		t.Fatal(err)
	}

	for name, pick := range map[string][]uuid.UUID{
		"six cards":       mine,
		"same card twice": {mine[0], mine[0]},
	} {
		if _, err := svc.SetShowcase(ctx, u, pick); !errors.Is(err, profile.ErrBadShowcase) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	for name, pick := range map[string][]uuid.UUID{
		"someone else's card":       {mine[0], theirs},
		"a card that doesn't exist": {uuid.New()},
	} {
		if _, err := svc.SetShowcase(ctx, u, pick); !errors.Is(err, profile.ErrNotOwned) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	// A refused save leaves the showcase as it was.
	if p, _ := svc.Get(ctx, "owner"); !same(ids(p), mine[:2]) {
		t.Fatalf("showcase changed by a refused save: %v", ids(p))
	}
	if _, err := svc.Get(ctx, "nobody"); !errors.Is(err, profile.ErrNotFound) {
		t.Fatalf("unknown player: %v", err)
	}
}

// Merged-away cards vanish from the showcase; a card that changes owner (trading,
// later) stops showing on the old owner's profile.
func TestShowcaseFollowsTheCards(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	u, other := newUser(t, pool, "keeper"), newUser(t, pool, "buyer")
	a, b, c := give(t, pool, u.ID, "rare", 0, 1), give(t, pool, u.ID, "rare", 1, 1), give(t, pool, u.ID, "rare", 2, 1)
	if _, err := svc.SetShowcase(ctx, u, []uuid.UUID{a, b, c}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "DELETE FROM cards WHERE id = $1", a); err != nil { // merged away
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE cards SET owner_id = $1 WHERE id = $2", other.ID, b); err != nil { // traded
		t.Fatal(err)
	}
	p, err := svc.Get(ctx, "keeper")
	if err != nil {
		t.Fatal(err)
	}
	if !p.Chosen || !same(ids(p), []uuid.UUID{c}) {
		t.Fatalf("showcase %v, want only the card still owned", ids(p))
	}
}
