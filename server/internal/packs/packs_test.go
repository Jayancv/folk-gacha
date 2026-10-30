package packs_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/game"
	"cardgame/server/internal/packs"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

// constRand always returns the same value, so every roll is predictable:
// 0 = all commons (the first card by id), 0.9999 = all legendaries.
type constRand float64

func (r constRand) Float64() float64 { return float64(r) }

var noon = time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)

// setup returns a pool with the Season 1 catalog loaded, nothing minted and no players.
func setup(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, daily_claims CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE season_cards SET minted = 0; UPDATE card_seasons SET starts_at = NULL, ends_at = NULL"); err != nil {
		t.Fatal(err)
	}
	return pool
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	u, err := store.New(pool).CreateUser(context.Background(), store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func service(pool *pgxpool.Pool, at time.Time, rng game.Rand) *packs.Service {
	s := packs.NewService(pool)
	s.Now = func() time.Time { return at }
	if rng != nil {
		s.Rand = rng
	}
	return s
}

func queryInt(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

const totalMinted = "SELECT coalesce(sum(minted), 0) FROM season_cards"

func TestClaimSavesFiveCardsOncePerDay(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "asha")
	svc := service(pool, noon, nil)

	st, err := svc.Status(ctx, user)
	if err != nil || !st.Ready {
		t.Fatalf("before claim: %+v %v", st, err)
	}

	claim, err := svc.ClaimDaily(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	if len(claim.Cards) != game.PackSize {
		t.Fatalf("got %d cards", len(claim.Cards))
	}
	for _, c := range claim.Cards {
		if c.OwnerID != user || c.AcquiredVia != "pack" || c.Level != 1 || c.CardSeasonID != "s1" || c.SetSize != 1500 {
			t.Fatalf("bad card %+v", c)
		}
	}
	if !claim.Day.Equal(game.ClaimDay(noon)) || !claim.NextReset.Equal(time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("day %v, next reset %v", claim.Day, claim.NextReset)
	}
	if n := queryInt(t, pool, totalMinted); n != game.PackSize {
		t.Fatalf("minted total = %d, want %d", n, game.PackSize)
	}

	// A second claim the same day fails and changes nothing.
	later := service(pool, noon.Add(11*time.Hour+59*time.Minute), nil)
	if _, err := later.ClaimDaily(ctx, user); !errors.Is(err, packs.ErrAlreadyClaimed) {
		t.Fatalf("second claim: %v", err)
	}
	if n := queryInt(t, pool, "SELECT count(*) FROM cards WHERE owner_id = $1", user); n != game.PackSize {
		t.Fatalf("cards after second claim = %d", n)
	}
	if n := queryInt(t, pool, totalMinted); n != game.PackSize {
		t.Fatalf("a failed claim minted cards: total %d", n)
	}
	if st, _ := svc.Status(ctx, user); st.Ready {
		t.Fatal("status still ready after claiming")
	}
}

func TestMidnightResetUTC(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "nimal")

	lastSecond := time.Date(2026, 10, 30, 23, 59, 59, 0, time.UTC)
	if _, err := service(pool, lastSecond, nil).ClaimDaily(ctx, user); err != nil {
		t.Fatal(err)
	}
	if _, err := service(pool, lastSecond.Add(999*time.Millisecond), nil).ClaimDaily(ctx, user); !errors.Is(err, packs.ErrAlreadyClaimed) {
		t.Fatalf("23:59:59.999: %v", err)
	}
	midnight := time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC)
	claim, err := service(pool, midnight, nil).ClaimDaily(ctx, user)
	if err != nil {
		t.Fatalf("00:00 claim: %v", err)
	}
	if !claim.Day.Equal(midnight) {
		t.Fatalf("day = %v", claim.Day)
	}
	// Local time doesn't matter: 23:00 on the 31st in Colombo is 17:30 UTC the same day.
	colombo := time.FixedZone("IST", 5*3600+1800)
	if _, err := service(pool, time.Date(2026, 10, 31, 23, 0, 0, 0, colombo), nil).ClaimDaily(ctx, user); !errors.Is(err, packs.ErrAlreadyClaimed) {
		t.Fatalf("Colombo evening, already claimed in UTC: %v", err)
	}
}

// Many claims at once for one player: exactly one wins.
func TestConcurrentClaimsGiveOnePack(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "racer")
	svc := service(pool, noon, nil)

	const n = 10
	errs := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, errs[i] = svc.ClaimDaily(ctx, user)
		}()
	}
	close(start)
	wg.Wait()

	ok := 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case !errors.Is(err, packs.ErrAlreadyClaimed):
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("%d claims succeeded, want 1", ok)
	}
	if c := queryInt(t, pool, "SELECT count(*) FROM cards WHERE owner_id = $1", user); c != game.PackSize {
		t.Fatalf("cards = %d", c)
	}
	if c := queryInt(t, pool, totalMinted); c != game.PackSize {
		t.Fatalf("minted total = %d", c)
	}
}

// Different players claiming at once don't fail each other, and copy numbers stay unique.
func TestConcurrentPlayersGetUniqueCopyNumbers(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	const n = 8
	users := make([]uuid.UUID, n)
	for i := range users {
		users[i] = newUser(t, pool, fmt.Sprintf("player_%d", i))
	}
	// constRand(0): every card of every pack is the same season card.
	svc := service(pool, noon, constRand(0))
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() { defer wg.Done(); _, errs[i] = svc.ClaimDaily(ctx, users[i]) }()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("player %d: %v", i, err)
		}
	}
	if c := queryInt(t, pool, "SELECT count(DISTINCT copy_no) FROM cards"); c != n*game.PackSize {
		t.Fatalf("distinct copy numbers = %d, want %d", c, n*game.PackSize)
	}
	if c := queryInt(t, pool, "SELECT max(copy_no) FROM cards"); c != n*game.PackSize {
		t.Fatalf("highest copy number = %d", c)
	}
}

func TestDuplicatesInOnePackGetConsecutiveCopyNumbers(t *testing.T) {
	pool := setup(t)
	user := newUser(t, pool, "dupes")
	claim, err := service(pool, noon, constRand(0)).ClaimDaily(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	for i, c := range claim.Cards {
		if c.SeasonCardID != claim.Cards[0].SeasonCardID || c.CopyNo != int32(i+1) {
			t.Fatalf("card %d: %s copy %d", i, c.SeasonCardID, c.CopyNo)
		}
	}
}

func TestPityGivesARareOnTheSeventhDryPack(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "unlucky")
	q := store.New(pool)

	// Six dry packs on the six days before.
	for d := 6; d >= 1; d-- {
		if err := q.InsertDailyClaim(ctx, store.InsertDailyClaimParams{
			UserID: user, Day: game.ClaimDay(noon).AddDate(0, 0, -d), CardSeasonID: "s1", PityCounter: int32(7 - d),
		}); err != nil {
			t.Fatal(err)
		}
	}
	// constRand(0) rolls five commons; pity must raise one to Rare.
	claim, err := service(pool, noon, constRand(0)).ClaimDaily(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	rares := 0
	for _, c := range claim.Cards {
		if game.Rarity(c.Rarity).AtLeastRare() {
			rares++
		}
	}
	if rares != 1 {
		t.Fatalf("got %d Rare+ cards, want exactly 1", rares)
	}
	if p, _ := q.LastPityCounter(ctx, user); p != 0 {
		t.Fatalf("pity counter after a Rare = %d, want 0", p)
	}

	// The next dry pack starts counting again.
	if _, err := service(pool, noon.AddDate(0, 0, 1), constRand(0)).ClaimDaily(ctx, user); err != nil {
		t.Fatal(err)
	}
	if p, _ := q.LastPityCounter(ctx, user); p != 1 {
		t.Fatalf("pity counter after a dry pack = %d, want 1", p)
	}
}

func TestCopyLimitsAndSoldOutFallback(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "collector")

	// Sell out every Legendary except one, which has 2 of its 25 copies left.
	var last string
	if err := pool.QueryRow(ctx, "SELECT max(id) FROM season_cards WHERE rarity = 'legendary'").Scan(&last); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE season_cards SET minted = max_copies - CASE WHEN id = $1 THEN 2 ELSE 0 END
		WHERE rarity = 'legendary'`, last); err != nil {
		t.Fatal(err)
	}

	// constRand(0.9999) rolls five Legendaries.
	claim, err := service(pool, noon, constRand(0.9999)).ClaimDaily(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	for i, c := range claim.Cards {
		switch {
		case i < 2 && (c.SeasonCardID != last || c.CopyNo != int32(24+i)):
			t.Fatalf("card %d: %s copy %d, want %s copy %d", i, c.SeasonCardID, c.CopyNo, last, 24+i)
		case i >= 2 && c.Rarity != "epic":
			t.Fatalf("card %d: %s, want an Epic once Legendaries sold out", i, c.Rarity)
		}
	}
	if n := queryInt(t, pool, "SELECT count(*) FROM season_cards WHERE max_copies IS NOT NULL AND minted > max_copies"); n != 0 {
		t.Fatalf("%d cards over their copy limit", n)
	}
}

func TestNoOpenSeason(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "early")
	if _, err := pool.Exec(ctx, "UPDATE card_seasons SET starts_at = $1", noon.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := service(pool, noon, nil).ClaimDaily(ctx, user); !errors.Is(err, packs.ErrNoSeason) {
		t.Fatalf("err = %v", err)
	}
	if n := queryInt(t, pool, "SELECT count(*) FROM daily_claims"); n != 0 {
		t.Fatal("a failed claim used up the day")
	}
}
