package collection_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/collection"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/game"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

type fixture struct {
	pool *pgxpool.Pool
	svc  *collection.Service
	user uuid.UUID
	// ids by name, in the order they were acquired
	ids map[string]uuid.UUID
}

// setup gives one player six cards (acquired a minute apart, oldest first)
// and another player one card that must never show up.
func setup(t *testing.T) fixture {
	t.Helper()
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, daily_claims, discovered_recipes CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE season_cards SET minted = 0"); err != nil {
		t.Fatal(err)
	}
	q := store.New(pool)
	newUser := func(name string) uuid.UUID {
		u, err := q.CreateUser(ctx, store.CreateUserParams{AuthID: "test:" + name, Username: name})
		if err != nil {
			t.Fatal(err)
		}
		return u.ID
	}
	f := fixture{pool: pool, svc: collection.NewService(pool), user: newUser("owner"), ids: map[string]uuid.UUID{}}
	other := newUser("someone_else")

	start := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	add := func(name string, owner uuid.UUID, template string, level int, at time.Time) {
		var id uuid.UUID
		err := pool.QueryRow(ctx, `WITH sc AS (
				UPDATE season_cards SET minted = minted + 1
				WHERE id = (SELECT min(id) FROM season_cards WHERE template_id = $1) RETURNING id, minted)
			INSERT INTO cards (season_card_id, copy_no, owner_id, level, acquired_via, acquired_at)
			SELECT id, minted, $2, $3, 'pack', $4 FROM sc RETURNING id`, template, owner, level, at).Scan(&id)
		if err != nil {
			t.Fatalf("add %s: %v", name, err)
		}
		f.ids[name] = id
	}
	for i, c := range []struct {
		name, template string
		level          int
	}{
		{"calf", "gaja-calf", 1},   // common earth
		{"calf3", "gaja-calf", 3},  // common earth, level 3
		{"malu", "malu", 1},        // common water
		{"simha", "simha", 2},      // uncommon fire
		{"naga", "naga-raksha", 1}, // epic water
		{"makara", "makara", 1},    // legendary water
	} {
		add(c.name, f.user, c.template, c.level, start.Add(time.Duration(i)*time.Minute))
	}
	add("theirs", other, "makara", 5, start.Add(time.Hour))
	return f
}

func (f fixture) list(t *testing.T, filter collection.Filter) ([]string, collection.Page) {
	t.Helper()
	page, err := f.svc.List(context.Background(), f.user, filter)
	if err != nil {
		t.Fatal(err)
	}
	names := map[uuid.UUID]string{}
	for n, id := range f.ids {
		names[id] = n
	}
	out := make([]string, len(page.Cards))
	for i, c := range page.Cards {
		out[i] = names[c.ID]
	}
	return out, page
}

func eq(t *testing.T, what string, got []string, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s: got %v, want %v", what, got, want)
		}
	}
}

func TestListNewestFirstAndOnlyYourOwn(t *testing.T) {
	f := setup(t)
	got, page := f.list(t, collection.Filter{})
	eq(t, "newest", got, "makara", "naga", "simha", "malu", "calf3", "calf")
	if page.Total != 6 || page.NextOffset != -1 {
		t.Fatalf("total %d, next %d", page.Total, page.NextOffset)
	}
}

func TestFilters(t *testing.T) {
	f := setup(t)
	got, page := f.list(t, collection.Filter{Rarities: []string{"epic", "legendary"}})
	eq(t, "epic+legendary", got, "makara", "naga")
	if page.Total != 2 {
		t.Fatalf("total = %d", page.Total)
	}
	got, _ = f.list(t, collection.Filter{Elements: []string{"water"}})
	eq(t, "water", got, "makara", "naga", "malu")
	got, _ = f.list(t, collection.Filter{Elements: []string{"water"}, Rarities: []string{"common"}})
	eq(t, "common water", got, "malu")
	got, _ = f.list(t, collection.Filter{Level: 3})
	eq(t, "level 3", got, "calf3")
	got, _ = f.list(t, collection.Filter{Spirit: "gaja-calf"})
	eq(t, "spirit", got, "calf3", "calf")
	got, _ = f.list(t, collection.Filter{Set: "s1", Rarities: []string{"uncommon"}})
	eq(t, "set s1", got, "simha")
	got, page = f.list(t, collection.Filter{Set: "s2"})
	eq(t, "unknown set", got)
	if page.Total != 0 || page.NextOffset != -1 {
		t.Fatalf("empty page %+v", page)
	}
}

func TestSorts(t *testing.T) {
	f := setup(t)
	// Score at level: the level-3 calf (common) outscores the level-1 commons.
	got, page := f.list(t, collection.Filter{Sort: collection.SortScore})
	if got[0] != "makara" || got[1] != "naga" {
		t.Fatalf("score: %v", got)
	}
	for i := 1; i < len(page.Cards); i++ {
		prev := game.LevelScore(int(page.Cards[i-1].Score), int(page.Cards[i-1].Level))
		cur := game.LevelScore(int(page.Cards[i].Score), int(page.Cards[i].Level))
		if cur > prev {
			t.Fatalf("score sort out of order at %d: %d after %d (%v)", i, cur, prev, got)
		}
	}

	// Set number: the two Gaja Calves share a set number; higher level first.
	got, page = f.list(t, collection.Filter{Sort: collection.SortNumber})
	if got[0] != "calf3" || got[1] != "calf" {
		t.Fatalf("number: %v", got)
	}
	for i := 1; i < len(page.Cards); i++ {
		if page.Cards[i].SetNo < page.Cards[i-1].SetNo {
			t.Fatalf("number sort out of order: %v", got)
		}
	}
}

func TestPaging(t *testing.T) {
	f := setup(t)
	var all []string
	offset := 0
	for range 10 {
		got, page := f.list(t, collection.Filter{Limit: 4, Offset: offset})
		if page.Total != 6 {
			t.Fatalf("total = %d", page.Total)
		}
		all = append(all, got...)
		if page.NextOffset < 0 {
			break
		}
		offset = page.NextOffset
	}
	eq(t, "all pages", all, "makara", "naga", "simha", "malu", "calf3", "calf")
}

func TestBadFilter(t *testing.T) {
	f := setup(t)
	if _, err := f.svc.List(context.Background(), f.user, collection.Filter{Sort: "random"}); !errors.Is(err, collection.ErrBadFilter) {
		t.Fatalf("err = %v", err)
	}
}
