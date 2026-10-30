package merges_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/game"
	"cardgame/server/internal/merges"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

// setup returns a pool with the Season 1 catalog and recipes loaded, and no players.
func setup(t *testing.T) (*pgxpool.Pool, *merges.Service) {
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
	return pool, merges.NewService(pool)
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	u, err := store.New(pool).CreateUser(context.Background(), store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

// give mints the nth season card (by id) of a spirit for the player at a level.
func give(t *testing.T, pool *pgxpool.Pool, owner uuid.UUID, template string, nth, level int) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var seasonCard string
	var copyNo int32
	err := pool.QueryRow(ctx, `UPDATE season_cards SET minted = minted + 1
		WHERE id = (SELECT id FROM season_cards WHERE template_id = $1 ORDER BY id OFFSET $2 LIMIT 1)
		RETURNING id, minted`, template, nth).Scan(&seasonCard, &copyNo)
	if err != nil {
		t.Fatalf("give %s: %v", template, err)
	}
	id, err := store.New(pool).CreateCard(ctx, store.CreateCardParams{
		SeasonCardID: seasonCard, CopyNo: copyNo, OwnerID: owner, Level: int16(level), AcquiredVia: "pack",
	})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func owned(t *testing.T, pool *pgxpool.Pool, owner uuid.UUID) map[uuid.UUID]bool {
	t.Helper()
	rows, err := pool.Query(context.Background(), "SELECT id FROM cards WHERE owner_id = $1", owner)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[uuid.UUID]bool{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		out[id] = true
	}
	return out
}

// unchanged fails unless the player owns exactly these cards.
func unchanged(t *testing.T, pool *pgxpool.Pool, owner uuid.UUID, ids ...uuid.UUID) {
	t.Helper()
	got := owned(t, pool, owner)
	if len(got) != len(ids) {
		t.Fatalf("player owns %d cards, want %d", len(got), len(ids))
	}
	for _, id := range ids {
		if !got[id] {
			t.Fatalf("card %s is gone", id)
		}
	}
}

func TestLevelUpKeepsTheTargetCard(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "asha")
	dragged := give(t, pool, user, "gaja-calf", 0, 1)
	target := give(t, pool, user, "gaja-calf", 1, 1) // a different Gaja Calf card

	var targetSeasonCard string
	var targetCopy int32
	if err := pool.QueryRow(ctx, "SELECT season_card_id, copy_no FROM cards WHERE id = $1", target).Scan(&targetSeasonCard, &targetCopy); err != nil {
		t.Fatal(err)
	}

	res, err := svc.Merge(ctx, user, dragged, target)
	if err != nil {
		t.Fatal(err)
	}
	c := res.Card
	if res.Kind != game.LevelUp || res.Discovered || c.Level != 2 || c.SeasonCardID != targetSeasonCard ||
		c.CopyNo != targetCopy || c.AcquiredVia != "merge" || c.OwnerID != user {
		t.Fatalf("result %+v", res)
	}
	if c.ID == dragged || c.ID == target {
		t.Fatal("the result should be a new card")
	}
	unchanged(t, pool, user, c.ID)

	// And on up to the highest level, then no further.
	card := c.ID
	for level := 2; level < game.MaxLevel; level++ {
		res, err := svc.Merge(ctx, user, give(t, pool, user, "gaja-calf", 2, level), card)
		if err != nil {
			t.Fatalf("level %d: %v", level, err)
		}
		card = res.Card.ID
	}
	top := give(t, pool, user, "gaja-calf", 3, game.MaxLevel)
	if _, err := svc.Merge(ctx, user, top, card); !errors.Is(err, game.ErrMaxLevel) {
		t.Fatalf("merging two max-level cards: %v", err)
	}
	unchanged(t, pool, user, card, top)
}

func TestCardsThatDontMergeAreLeftAlone(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "nimal")

	l1, l2 := give(t, pool, user, "gaja-calf", 0, 1), give(t, pool, user, "gaja-calf", 0, 2)
	if _, err := svc.Merge(ctx, user, l1, l2); !errors.Is(err, game.ErrNoRecipe) {
		t.Fatalf("different levels: %v", err)
	}
	malu := give(t, pool, user, "malu", 0, 1)
	if _, err := svc.Merge(ctx, user, l1, malu); !errors.Is(err, game.ErrNoRecipe) {
		t.Fatalf("no recipe: %v", err)
	}
	if _, err := svc.Merge(ctx, user, l1, l1); !errors.Is(err, merges.ErrSameCard) {
		t.Fatalf("same card: %v", err)
	}
	unchanged(t, pool, user, l1, l2, malu)
}

func TestCantMergeCardsYouDontOwn(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	me, other := newUser(t, pool, "mine"), newUser(t, pool, "theirs")
	mine := give(t, pool, me, "gaja-calf", 0, 1)
	theirs := give(t, pool, other, "gaja-calf", 0, 1)

	for name, ids := range map[string][2]uuid.UUID{
		"their card onto mine":      {theirs, mine},
		"my card onto theirs":       {mine, theirs},
		"a card that doesn't exist": {mine, uuid.New()},
	} {
		if _, err := svc.Merge(ctx, me, ids[0], ids[1]); !errors.Is(err, merges.ErrNotOwned) {
			t.Fatalf("%s: %v", name, err)
		}
	}
	unchanged(t, pool, me, mine)
	unchanged(t, pool, other, theirs)
}

func TestRecipeMakesANewSpiritAndIsDiscoveredOnce(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "chef")

	// Levels don't matter for recipes; the result starts at level 1.
	res, err := svc.Merge(ctx, user, give(t, pool, user, "simha", 0, 3), give(t, pool, user, "gaja-calf", 0, 2))
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != game.RecipeMerge || !res.Discovered || res.Card.TemplateID != "gajasinghe" ||
		res.Card.Level != 1 || res.Card.CopyNo != 1 || res.Card.Rarity != "rare" || res.Card.CardSeasonID != "s1" {
		t.Fatalf("result %+v", res)
	}
	unchanged(t, pool, user, res.Card.ID)

	// The other way round is the same recipe, and no longer a discovery.
	again, err := svc.Merge(ctx, user, give(t, pool, user, "gaja-calf", 1, 1), give(t, pool, user, "simha", 1, 1))
	if err != nil {
		t.Fatal(err)
	}
	if again.Kind != game.RecipeMerge || again.Discovered || again.Card.TemplateID != "gajasinghe" {
		t.Fatalf("second time %+v", again)
	}

	book, err := svc.Discovered(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	if len(book) != 1 || book[0].InputA != "gaja-calf" || book[0].InputB != "simha" || book[0].OutputTemplateID != "gajasinghe" {
		t.Fatalf("recipe book %+v", book)
	}
	// Discoveries are per player.
	if other, _ := svc.Discovered(ctx, newUser(t, pool, "newbie")); len(other) != 0 {
		t.Fatalf("a new player already knows %v", other)
	}
}

func TestSoldOutRecipeOutputKeepsTheInputs(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "late")
	// Rares are unlimited in Season 1; cap them at zero copies left for this test.
	if _, err := pool.Exec(ctx, "UPDATE season_cards SET max_copies = minted WHERE template_id = 'gajasinghe'"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), "UPDATE season_cards SET max_copies = NULL WHERE template_id = 'gajasinghe'")
	})
	calf, simha := give(t, pool, user, "gaja-calf", 0, 1), give(t, pool, user, "simha", 0, 1)
	if _, err := svc.Merge(ctx, user, calf, simha); !errors.Is(err, merges.ErrSoldOut) {
		t.Fatalf("err = %v", err)
	}
	unchanged(t, pool, user, calf, simha)
	if book, _ := svc.Discovered(ctx, user); len(book) != 0 {
		t.Fatal("a failed merge recorded a discovery")
	}
}

// Two merges racing for the same card (a double tap, or two tabs): exactly one
// wins, the other finds the card gone, and no card is duplicated.
func TestConcurrentMergesOfOneCard(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "racer")

	for round := range 10 {
		a, b, c := give(t, pool, user, "malu", 0, 1), give(t, pool, user, "malu", 1, 1), give(t, pool, user, "malu", 2, 1)
		before := len(owned(t, pool, user))
		// Round-robin the shapes: two cards onto one target, and A onto B against B onto A.
		pairs := [][2]uuid.UUID{{a, b}, {c, b}}
		if round%2 == 1 {
			pairs = [][2]uuid.UUID{{a, b}, {b, a}}
		}
		errs := make([]error, 2)
		var wg sync.WaitGroup
		start := make(chan struct{})
		for i, p := range pairs {
			wg.Add(1)
			go func() { defer wg.Done(); <-start; _, errs[i] = svc.Merge(ctx, user, p[0], p[1]) }()
		}
		close(start)
		wg.Wait()

		ok := 0
		for _, err := range errs {
			switch {
			case err == nil:
				ok++
			case !errors.Is(err, merges.ErrNotOwned):
				t.Fatalf("round %d: %v", round, err)
			}
		}
		if ok != 1 {
			t.Fatalf("round %d: %d merges succeeded, want 1 (%v)", round, ok, errs)
		}
		if got := len(owned(t, pool, user)); got != before-1 {
			t.Fatalf("round %d: %d cards, want %d", round, got, before-1)
		}
	}
}

func seasonPoints(t *testing.T, pool *pgxpool.Pool, user uuid.UUID) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), "SELECT coalesce(sum(points), 0) FROM season_points WHERE user_id = $1", user).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func level1Score(t *testing.T, pool *pgxpool.Pool, card uuid.UUID) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), "SELECT sc.score FROM cards c JOIN season_cards sc ON sc.id = c.season_card_id WHERE c.id = $1", card).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// A merge earns the new card's score, in the week of the merge.
func TestMergesEarnSeasonPoints(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	svc.Now = func() time.Time { return time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC) }
	user := newUser(t, pool, "merger")

	target := give(t, pool, user, "gaja-calf", 1, 2)
	up, err := svc.Merge(ctx, user, give(t, pool, user, "gaja-calf", 0, 2), target)
	if err != nil {
		t.Fatal(err)
	}
	wantUp := game.LevelScore(level1Score(t, pool, up.Card.ID), 3)
	if up.Points != wantUp || up.SeasonID != "2026-W44" {
		t.Fatalf("level up earned %d in %s, want %d in 2026-W44", up.Points, up.SeasonID, wantUp)
	}

	recipe, err := svc.Merge(ctx, user, give(t, pool, user, "simha", 0, 1), up.Card.ID)
	if err != nil {
		t.Fatal(err)
	}
	if want := level1Score(t, pool, recipe.Card.ID); recipe.Points != want {
		t.Fatalf("recipe earned %d, want the Gajasinghe's score %d", recipe.Points, want)
	}
	if got := seasonPoints(t, pool, user); got != up.Points+recipe.Points {
		t.Fatalf("season points = %d, want %d", got, up.Points+recipe.Points)
	}

	// Failed merges earn nothing.
	if _, err := svc.Merge(ctx, user, give(t, pool, user, "malu", 0, 1), give(t, pool, user, "ura", 0, 1)); !errors.Is(err, game.ErrNoRecipe) {
		t.Fatal(err)
	}
	if got := seasonPoints(t, pool, user); got != up.Points+recipe.Points {
		t.Fatalf("a failed merge changed the points to %d", got)
	}
}
