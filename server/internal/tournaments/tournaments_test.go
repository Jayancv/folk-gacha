package tournaments_test

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
	"cardgame/server/internal/tournaments"
	"cardgame/server/internal/trades"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

var t0 = time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC) // a Wednesday; daily entries close at 20:00

const (
	today    = "daily-2026-11-04"
	thisWeek = "weekly-2026-W45"
)

// Two small series, both Power with 3 slots, so tests choose the cards freely.
const testRules = `
series:
  - { id: daily, name: Daily Cup, cadence: daily, entryHours: 20, formats: [power] }
  - { id: weekly, name: Weekly Grand, cadence: weekly, entryHours: 120, formats: [power] }
formats:
  power: { kind: power, name: Power, slots: 3 }
`

type env struct {
	pool   *pgxpool.Pool
	svc    *tournaments.Service
	merges *merges.Service
	trades *trades.Service
	clock  *time.Time
}

func setup(t *testing.T) env {
	t.Helper()
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, trades, tournaments, daily_claims, discovered_recipes, season_points, seasons CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE season_cards SET minted = 0"); err != nil {
		t.Fatal(err)
	}
	r, err := game.ParseTournamentRules([]byte(testRules))
	if err != nil {
		t.Fatal(err)
	}
	old := game.CurrentTournamentRules()
	game.UseTournamentRules(r)
	t.Cleanup(func() { game.UseTournamentRules(old) })

	clock := t0
	now := func() time.Time { return clock }
	e := env{pool: pool, svc: tournaments.NewService(pool), merges: merges.NewService(pool), trades: trades.NewService(pool), clock: &clock}
	e.svc.Now, e.merges.Now, e.trades.Now = now, now, now
	return e
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	u, err := store.New(pool).CreateUser(ctx, store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET created_at = $2 WHERE id = $1", u.ID, t0.AddDate(0, 0, -30)); err != nil {
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

// three gives a player three different Commons.
func three(t *testing.T, pool *pgxpool.Pool, owner uuid.UUID, nth int) []uuid.UUID {
	return []uuid.UUID{
		give(t, pool, owner, "gaja-calf", nth, 1),
		give(t, pool, owner, "malu", nth, 1),
		give(t, pool, owner, "monara", nth, 1),
	}
}

// lockedIn is the tournament a card is locked in ("" if none).
func lockedIn(t *testing.T, pool *pgxpool.Pool, card uuid.UUID) string {
	t.Helper()
	var id *string
	if err := pool.QueryRow(context.Background(), "SELECT locked_in_tournament_id FROM cards WHERE id = $1", card).Scan(&id); err != nil {
		t.Fatalf("card %s: %v", card, err)
	}
	if id == nil {
		return ""
	}
	return *id
}

func (e env) step(t *testing.T) (closed, finished []string) {
	t.Helper()
	c, f, err := e.svc.Step(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return c, f
}

func TestEnterLocksCardsAndSwappingFreesThem(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha := newUser(t, e.pool, "asha")
	cards := three(t, e.pool, asha, 0)
	spare := give(t, e.pool, asha, "hansa", 0, 2)

	entry, err := e.svc.Enter(ctx, asha, today, cards)
	if err != nil {
		t.Fatal(err)
	}
	if len(entry.Cards) != 3 || entry.Cards[0].CardID != cards[0] || entry.Cards[0].Card == nil || entry.Score.Total == 0 {
		t.Fatalf("entry %+v", entry)
	}
	for _, c := range cards {
		if got := lockedIn(t, e.pool, c); got != today {
			t.Errorf("card %s locked in %q", c, got)
		}
	}

	// Swap the last card: it's free again, the new one is locked.
	swapped := []uuid.UUID{cards[0], cards[1], spare}
	entry, err = e.svc.Enter(ctx, asha, today, swapped)
	if err != nil {
		t.Fatal(err)
	}
	if lockedIn(t, e.pool, cards[2]) != "" || lockedIn(t, e.pool, spare) != today {
		t.Error("swap didn't move the lock")
	}
	d, err := e.svc.Get(ctx, asha, today)
	if err != nil {
		t.Fatal(err)
	}
	if d.You == nil || d.You.Cards[2].CardID != spare || d.Entries != 1 || d.Seed != nil || d.SeedHash == "" {
		t.Fatalf("detail %+v", d)
	}
	if d.You.Score.Total != entry.Score.Total {
		t.Errorf("detail total %d, entry total %d", d.You.Score.Total, entry.Score.Total)
	}
	list, next, err := e.svc.List(ctx, asha)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || len(next) != 2 {
		t.Fatalf("list %d, next %d", len(list), len(next))
	}
	for _, x := range list {
		if x.Entered != (x.ID == today) {
			t.Errorf("%s entered = %v", x.ID, x.Entered)
		}
	}

	if err := e.svc.Withdraw(ctx, asha, today); err != nil {
		t.Fatal(err)
	}
	for _, c := range swapped {
		if lockedIn(t, e.pool, c) != "" {
			t.Errorf("card %s still locked after withdrawing", c)
		}
	}
	if err := e.svc.Withdraw(ctx, asha, today); !errors.Is(err, tournaments.ErrNoEntry) {
		t.Errorf("second withdraw: %v", err)
	}
}

func TestEnterRefusesCardsItCantUse(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, e.pool, "asha"), newUser(t, e.pool, "ben")
	cards := three(t, e.pool, asha, 0)
	bens := give(t, e.pool, ben, "simha", 0, 1)
	offered := give(t, e.pool, asha, "ura", 0, 1)
	if _, err := e.trades.Create(ctx, asha, trades.NewOffer{To: "ben", Offer: []uuid.UUID{offered}, Request: []uuid.UUID{bens}}); err != nil {
		t.Fatal(err)
	}

	for _, c := range []struct {
		name  string
		id    string
		cards []uuid.UUID
		want  error
	}{
		{"too few", today, cards[:2], game.ErrLineupSize},
		{"twice", today, []uuid.UUID{cards[0], cards[0], cards[1]}, game.ErrLineupDuplicate},
		{"someone else's", today, []uuid.UUID{cards[0], cards[1], bens}, tournaments.ErrNotOwned},
		{"no such card", today, []uuid.UUID{cards[0], cards[1], uuid.New()}, tournaments.ErrNotOwned},
		{"in a trade offer", today, []uuid.UUID{cards[0], cards[1], offered}, tournaments.ErrInTrade},
		{"no such tournament", "daily-1999-01-01", cards, tournaments.ErrNotFound},
	} {
		if _, err := e.svc.Enter(ctx, asha, c.id, c.cards); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, want %v", c.name, err, c.want)
		}
		if _, err := e.svc.Preview(ctx, asha, c.id, c.cards); !errors.Is(err, c.want) {
			t.Errorf("preview %s: %v, want %v", c.name, err, c.want)
		}
	}
	for _, c := range cards {
		if lockedIn(t, e.pool, c) != "" {
			t.Fatalf("a refused entry locked card %s", c)
		}
	}

	// A card in one tournament can't go into another at the same time.
	if _, err := e.svc.Enter(ctx, asha, today, cards); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Enter(ctx, asha, thisWeek, cards); !errors.Is(err, tournaments.ErrInTournament) {
		t.Errorf("same cards in the weekly: %v", err)
	}
	// Preview of the saved lineup works (its own lock doesn't count against it).
	if s, err := e.svc.Preview(ctx, asha, today, cards); err != nil || s.Total == 0 {
		t.Errorf("preview of own lineup: %+v, %v", s, err)
	}

	// Entries close at 20:00.
	*e.clock = time.Date(2026, 11, 4, 20, 0, 0, 0, time.UTC)
	if _, err := e.svc.Enter(ctx, asha, today, cards); !errors.Is(err, tournaments.ErrClosed) {
		t.Errorf("after close: %v", err)
	}
	if err := e.svc.Withdraw(ctx, asha, today); !errors.Is(err, tournaments.ErrClosed) {
		t.Errorf("withdraw after close: %v", err)
	}
}

func TestEnteredCardsCantBeMergedOrTraded(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, e.pool, "asha"), newUser(t, e.pool, "ben")
	pairA, pairB := give(t, e.pool, asha, "gaja-calf", 0, 1), give(t, e.pool, asha, "gaja-calf", 1, 1)
	other := give(t, e.pool, asha, "malu", 0, 1)
	bens := three(t, e.pool, ben, 2)
	benSpare := give(t, e.pool, ben, "hansa", 0, 1)

	// Ben's card is asked for before he enters it.
	asked, err := e.trades.Create(ctx, asha, trades.NewOffer{To: "ben", Offer: []uuid.UUID{other}, Request: []uuid.UUID{bens[0]}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Enter(ctx, asha, today, []uuid.UUID{pairA, pairB, give(t, e.pool, asha, "monara", 0, 1)}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Enter(ctx, ben, today, bens); err != nil {
		t.Fatal(err)
	}

	if _, err := e.merges.Merge(ctx, asha, pairA, pairB); !errors.Is(err, merges.ErrInTournament) {
		t.Errorf("merge: %v", err)
	}
	if _, err := e.trades.Create(ctx, asha, trades.NewOffer{To: "ben", Offer: []uuid.UUID{pairA}, Request: []uuid.UUID{benSpare}}); !errors.Is(err, trades.ErrInTournament) {
		t.Errorf("offering an entered card: %v", err)
	}
	if _, err := e.trades.Create(ctx, ben, trades.NewOffer{To: "asha", Offer: []uuid.UUID{benSpare}, Request: []uuid.UUID{pairB}}); !errors.Is(err, trades.ErrInTournament) {
		t.Errorf("asking for an entered card: %v", err)
	}
	if _, err := e.trades.Accept(ctx, ben, asked.ID); !errors.Is(err, trades.ErrInTournament) {
		t.Errorf("accepting an offer for an entered card: %v", err)
	}
	if lockedIn(t, e.pool, bens[0]) != today {
		t.Error("the entered card moved")
	}
}

func TestCloseScoresAndRanksThenFinishFreesCards(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha, ben, chen := newUser(t, e.pool, "asha"), newUser(t, e.pool, "ben"), newUser(t, e.pool, "chen")
	ashas := []uuid.UUID{give(t, e.pool, asha, "gaja-calf", 0, 3), give(t, e.pool, asha, "malu", 0, 1), give(t, e.pool, asha, "monara", 0, 1)}
	bens := three(t, e.pool, ben, 1)
	if _, err := e.svc.Enter(ctx, asha, today, ashas); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Enter(ctx, ben, today, bens); err != nil {
		t.Fatal(err)
	}
	if closed, _ := e.step(t); len(closed) != 0 {
		t.Fatalf("closed %v before 20:00", closed)
	}

	*e.clock = time.Date(2026, 11, 4, 20, 0, 0, 0, time.UTC)
	closed, finished := e.step(t)
	if len(closed) != 1 || closed[0] != today || len(finished) != 0 {
		t.Fatalf("closed %v finished %v", closed, finished)
	}
	if again, _ := e.step(t); len(again) != 0 {
		t.Errorf("closed twice: %v", again)
	}

	d, err := e.svc.Get(ctx, chen, today)
	if err != nil {
		t.Fatal(err)
	}
	if d.Status != game.TournamentLocked || len(d.Results) != 2 || d.You != nil {
		t.Fatalf("detail %+v", d)
	}
	if d.Results[0].Username != "asha" || d.Results[0].Rank != 1 || d.Results[1].Username != "ben" || d.Results[0].Score <= d.Results[1].Score {
		t.Errorf("results %+v", d.Results)
	}
	if d.Seed == nil || game.SeedHash(d.Seed) != d.SeedHash {
		t.Error("seed not revealed, or doesn't match its hash")
	}
	mine, err := e.svc.Get(ctx, asha, today)
	if err != nil {
		t.Fatal(err)
	}
	if mine.You == nil || mine.You.Rank != 1 || mine.You.Score.Total != d.Results[0].Score || len(mine.You.Score.Cards) != 3 {
		t.Fatalf("asha's entry %+v", mine.You)
	}
	var snapshots int
	if err := e.pool.QueryRow(ctx, "SELECT count(*) FROM tournament_entry_cards WHERE tournament_id = $1 AND snapshot IS NOT NULL", today).Scan(&snapshots); err != nil || snapshots != 6 {
		t.Errorf("snapshots %d, %v", snapshots, err)
	}
	// Still locked until the day ends.
	if lockedIn(t, e.pool, ashas[0]) != today {
		t.Error("cards freed at close")
	}

	*e.clock = time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)
	_, finished = e.step(t)
	if len(finished) != 1 || finished[0] != today {
		t.Fatalf("finished %v", finished)
	}
	for _, c := range append(ashas, bens...) {
		if lockedIn(t, e.pool, c) != "" {
			t.Errorf("card %s still locked after the end", c)
		}
	}
	// Results stay as scored, even after a card is merged away.
	if _, err := e.pool.Exec(ctx, "DELETE FROM cards WHERE id = $1", ashas[0]); err != nil {
		t.Fatal(err)
	}
	after, err := e.svc.Get(ctx, asha, today)
	if err != nil {
		t.Fatal(err)
	}
	if after.Status != game.TournamentFinished || after.You.Score.Total != mine.You.Score.Total || after.You.Cards[0].Card != nil {
		t.Errorf("after finish %+v", after.You)
	}
}

func TestCardsSitOutTheNextTournament(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha := newUser(t, e.pool, "asha")
	cards := three(t, e.pool, asha, 0)
	fresh := three(t, e.pool, asha, 1)
	if _, err := e.svc.Enter(ctx, asha, today, cards); err != nil {
		t.Fatal(err)
	}
	*e.clock = time.Date(2026, 11, 5, 9, 0, 0, 0, time.UTC)
	e.step(t) // closes and finishes yesterday's

	tomorrow := "daily-2026-11-05"
	if _, err := e.svc.Enter(ctx, asha, tomorrow, []uuid.UUID{cards[0], fresh[1], fresh[2]}); !errors.Is(err, tournaments.ErrCooldown) {
		t.Errorf("card from yesterday's tournament: %v", err)
	}
	if _, err := e.svc.Enter(ctx, asha, tomorrow, fresh); err != nil {
		t.Errorf("fresh cards: %v", err)
	}
	// Another series doesn't count.
	if _, err := e.svc.Enter(ctx, asha, thisWeek, cards); err != nil {
		t.Errorf("yesterday's cards in the weekly: %v", err)
	}
	// The day after, they're welcome again.
	*e.clock = time.Date(2026, 11, 6, 9, 0, 0, 0, time.UTC)
	e.step(t)
	if err := e.svc.Withdraw(ctx, asha, thisWeek); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Enter(ctx, asha, "daily-2026-11-06", cards); err != nil {
		t.Errorf("two days later: %v", err)
	}
}

func TestStepCatchesUpATournamentItMissed(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha := newUser(t, e.pool, "asha")
	cards := three(t, e.pool, asha, 0)
	if _, err := e.svc.Enter(ctx, asha, today, cards); err != nil {
		t.Fatal(err)
	}
	// The server was down for two days.
	*e.clock = time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	closed, finished := e.step(t)
	if len(closed) != 1 || closed[0] != today || len(finished) != 1 || finished[0] != today {
		t.Fatalf("closed %v finished %v", closed, finished)
	}
	d, err := e.svc.Get(ctx, asha, today)
	if err != nil || d.You == nil || d.You.Rank != 1 {
		t.Fatalf("%+v %v", d.You, err)
	}
	if lockedIn(t, e.pool, cards[0]) != "" {
		t.Error("cards still locked")
	}
	if _, err := e.svc.Get(ctx, asha, "daily-2026-11-06"); err != nil {
		t.Errorf("today's tournament: %v", err)
	}
}

// Concurrency: one card, two tournaments at once. Exactly one entry gets it.
func TestSameCardIntoTwoTournamentsAtOnce(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha := newUser(t, e.pool, "asha")
	for round := range 10 {
		shared := give(t, e.pool, asha, "gaja-calf", round, 1)
		lineups := map[string][]uuid.UUID{
			today:    {shared, give(t, e.pool, asha, "malu", round, 1), give(t, e.pool, asha, "monara", round, 1)},
			thisWeek: {shared, give(t, e.pool, asha, "malu", 20+round, 1), give(t, e.pool, asha, "monara", 20+round, 1)},
		}
		var wg sync.WaitGroup
		errs := map[string]error{}
		var mu sync.Mutex
		for id, cards := range lineups {
			wg.Go(func() {
				_, err := e.svc.Enter(ctx, asha, id, cards)
				mu.Lock()
				errs[id] = err
				mu.Unlock()
			})
		}
		wg.Wait()
		var won string
		for id, err := range errs {
			switch {
			case err == nil:
				if won != "" {
					t.Fatalf("round %d: both entries got the card", round)
				}
				won = id
			case !errors.Is(err, tournaments.ErrInTournament):
				t.Fatalf("round %d %s: %v", round, id, err)
			}
		}
		if won == "" || lockedIn(t, e.pool, shared) != won {
			t.Fatalf("round %d: won %q, card locked in %q", round, won, lockedIn(t, e.pool, shared))
		}
		if err := e.svc.Withdraw(ctx, asha, won); err != nil {
			t.Fatal(err)
		}
	}
}

// Concurrency: entering a card while it is merged. Either the merge wins (the entry
// finds the card gone) or the entry wins (the merge finds it locked); never both.
func TestEnterRacingAMerge(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha := newUser(t, e.pool, "asha")
	for round := range 10 {
		a, b := give(t, e.pool, asha, "gaja-calf", 2*round, 1), give(t, e.pool, asha, "gaja-calf", 2*round+1, 1)
		lineup := []uuid.UUID{a, give(t, e.pool, asha, "malu", round, 1), give(t, e.pool, asha, "monara", round, 1)}
		var enterErr, mergeErr error
		var wg sync.WaitGroup
		wg.Go(func() { _, enterErr = e.svc.Enter(ctx, asha, today, lineup) })
		wg.Go(func() { _, mergeErr = e.merges.Merge(ctx, asha, b, a) })
		wg.Wait()
		switch {
		case enterErr == nil && errors.Is(mergeErr, merges.ErrInTournament):
			if err := e.svc.Withdraw(ctx, asha, today); err != nil {
				t.Fatal(err)
			}
		case mergeErr == nil && errors.Is(enterErr, tournaments.ErrNotOwned):
		default:
			t.Fatalf("round %d: enter %v, merge %v", round, enterErr, mergeErr)
		}
	}
}

// Concurrency: a player enters a card while accepting an offer that gives it away.
func TestEnterRacingATradeAccept(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	rules := game.CurrentRules()
	t.Cleanup(func() { game.UseRules(rules) })
	more := rules
	more.Trading.DailyOfferLimit = 100 // one offer per round
	game.UseRules(more)
	asha, ben := newUser(t, e.pool, "asha"), newUser(t, e.pool, "ben")
	for round := range 10 {
		wanted := give(t, e.pool, ben, "simha", round, 1)
		lineup := []uuid.UUID{wanted, give(t, e.pool, ben, "malu", round, 1), give(t, e.pool, ben, "monara", round, 1)}
		offer, err := e.trades.Create(ctx, asha, trades.NewOffer{To: "ben", Offer: []uuid.UUID{give(t, e.pool, asha, "hansa", round, 1)}, Request: []uuid.UUID{wanted}})
		if err != nil {
			t.Fatal(err)
		}
		var enterErr, acceptErr error
		var wg sync.WaitGroup
		wg.Go(func() { _, enterErr = e.svc.Enter(ctx, ben, today, lineup) })
		wg.Go(func() { _, acceptErr = e.trades.Accept(ctx, ben, offer.ID) })
		wg.Wait()
		var owner uuid.UUID
		if err := e.pool.QueryRow(ctx, "SELECT owner_id FROM cards WHERE id = $1", wanted).Scan(&owner); err != nil {
			t.Fatal(err)
		}
		switch {
		case enterErr == nil && errors.Is(acceptErr, trades.ErrInTournament):
			if owner != ben || lockedIn(t, e.pool, wanted) != today {
				t.Fatalf("round %d: entered, but the card is %s's / locked in %q", round, owner, lockedIn(t, e.pool, wanted))
			}
			if err := e.svc.Withdraw(ctx, ben, today); err != nil {
				t.Fatal(err)
			}
			if _, err := e.trades.Decline(ctx, ben, offer.ID); err != nil {
				t.Fatal(err)
			}
		case acceptErr == nil && errors.Is(enterErr, tournaments.ErrNotOwned):
			if owner != asha || lockedIn(t, e.pool, wanted) != "" {
				t.Fatalf("round %d: traded, but the card is %s's / locked in %q", round, owner, lockedIn(t, e.pool, wanted))
			}
		default:
			t.Fatalf("round %d: enter %v, accept %v", round, enterErr, acceptErr)
		}
	}
}

// Two servers running the job at once close and finish each tournament once.
func TestTwoServersStepOnce(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	asha := newUser(t, e.pool, "asha")
	if _, err := e.svc.Enter(ctx, asha, today, three(t, e.pool, asha, 0)); err != nil {
		t.Fatal(err)
	}
	*e.clock = time.Date(2026, 11, 5, 1, 0, 0, 0, time.UTC)
	other := tournaments.NewService(e.pool)
	other.Now = e.svc.Now
	var wg sync.WaitGroup
	var mu sync.Mutex
	var closed, finished []string
	for _, s := range []*tournaments.Service{e.svc, other} {
		wg.Go(func() {
			c, f, err := s.Step(ctx)
			if err != nil {
				t.Error(err)
			}
			mu.Lock()
			closed, finished = append(closed, c...), append(finished, f...)
			mu.Unlock()
		})
	}
	wg.Wait()
	if len(closed) != 1 || len(finished) != 1 {
		t.Errorf("closed %v finished %v", closed, finished)
	}
}
