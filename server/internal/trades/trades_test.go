package trades_test

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
	"cardgame/server/internal/trades"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

var t0 = time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC) // a Wednesday, mid-week

// setup returns a pool with the Season 1 catalog and no players, and a trade
// service whose clock is at t0 (move it with clock).
func setup(t *testing.T) (*pgxpool.Pool, *trades.Service, *time.Time) {
	t.Helper()
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, trades, daily_claims, discovered_recipes, season_points, seasons CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE season_cards SET minted = 0"); err != nil {
		t.Fatal(err)
	}
	clock := t0
	svc := trades.NewService(pool)
	svc.Now = func() time.Time { return clock }
	return pool, svc, &clock
}

// newUser makes a player whose 7-day trade lock is over.
func newUser(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	u, err := store.New(pool).CreateUser(ctx, store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET trade_unlocked_at = $2 WHERE id = $1", u.ID, t0.Add(-time.Hour)); err != nil {
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

type cardState struct {
	owner  uuid.UUID
	via    string
	traded bool
	locked bool
}

func state(t *testing.T, pool *pgxpool.Pool, card uuid.UUID) cardState {
	t.Helper()
	var s cardState
	err := pool.QueryRow(context.Background(),
		"SELECT owner_id, acquired_via, traded, locked_in_trade_id IS NOT NULL FROM cards WHERE id = $1", card).
		Scan(&s.owner, &s.via, &s.traded, &s.locked)
	if err != nil {
		t.Fatalf("card %s: %v", card, err)
	}
	return s
}

func offer(to string, give, want []uuid.UUID) trades.NewOffer {
	return trades.NewOffer{To: to, Offer: give, Request: want}
}

func ids(x ...uuid.UUID) []uuid.UUID { return x }

func TestAcceptSwapsAllCards(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	a1, a2 := give(t, pool, asha, "gaja-calf", 0, 1), give(t, pool, asha, "malu", 0, 2)
	b1 := give(t, pool, ben, "simha", 0, 1)
	// Ben shows b1 on his profile; after the trade it's Asha's, so it leaves his showcase.
	if _, err := pool.Exec(ctx, "INSERT INTO showcase_cards (user_id, position, card_id) VALUES ($1, 1, $2)", ben, b1); err != nil {
		t.Fatal(err)
	}

	tr, err := svc.Create(ctx, asha, offer("BEN", ids(a1, a2), ids(b1)))
	if err != nil {
		t.Fatal(err)
	}
	if tr.Status != trades.StatusOpen || tr.From.Username != "asha" || tr.To.Username != "ben" ||
		len(tr.Offer) != 2 || len(tr.Request) != 1 || tr.Offer[0].CardID != a1 || tr.Offer[0].Card == nil {
		t.Fatalf("created %+v", tr)
	}
	if !tr.ExpiresAt.Equal(t0.Add(48 * time.Hour)) {
		t.Errorf("expires %v", tr.ExpiresAt)
	}
	if s := state(t, pool, a1); !s.locked {
		t.Error("offered card isn't locked")
	}
	if s := state(t, pool, b1); s.locked {
		t.Error("requested card is locked (anyone could freeze other players' cards)")
	}

	done, err := svc.Accept(ctx, ben, tr.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != trades.StatusAccepted || done.ResolvedAt == nil {
		t.Fatalf("accepted %+v", done)
	}
	for card, owner := range map[uuid.UUID]uuid.UUID{a1: ben, a2: ben, b1: asha} {
		s := state(t, pool, card)
		if s.owner != owner || s.via != "trade" || !s.traded || s.locked {
			t.Errorf("card %s after the trade: %+v", card, s)
		}
	}
	var showcased int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM showcase_cards").Scan(&showcased); err != nil || showcased != 0 {
		t.Errorf("showcase rows = %d (%v), want 0", showcased, err)
	}
	if _, err := svc.Accept(ctx, ben, tr.ID); !isNotOpen(err, trades.StatusAccepted) {
		t.Errorf("second accept: %v", err)
	}
}

func isNotOpen(err error, status string) bool {
	var e *trades.NotOpenError
	return errors.As(err, &e) && e.Status == status
}

func TestOfferedCardsAreLocked(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben, cara := newUser(t, pool, "asha"), newUser(t, pool, "ben"), newUser(t, pool, "cara")
	a1, a2 := give(t, pool, asha, "gaja-calf", 0, 1), give(t, pool, asha, "gaja-calf", 1, 1)
	b1, c1 := give(t, pool, ben, "simha", 0, 1), give(t, pool, cara, "ura", 0, 1)

	tr, err := svc.Create(ctx, asha, offer("ben", ids(a1), ids(b1)))
	if err != nil {
		t.Fatal(err)
	}
	// Not in a second offer...
	if _, err := svc.Create(ctx, asha, offer("cara", ids(a1), ids(c1))); !errors.Is(err, trades.ErrInTrade) {
		t.Errorf("offered twice: %v", err)
	}
	// ...and not merged.
	if _, err := merges.NewService(pool).Merge(ctx, asha, a2, a1); !errors.Is(err, merges.ErrInTrade) {
		t.Errorf("merged a locked card: %v", err)
	}
	// Cancelling frees it.
	if _, err := svc.Cancel(ctx, asha, tr.ID); err != nil {
		t.Fatal(err)
	}
	if state(t, pool, a1).locked {
		t.Error("still locked after cancel")
	}
	if _, err := merges.NewService(pool).Merge(ctx, asha, a2, a1); err != nil {
		t.Errorf("merge after cancel: %v", err)
	}
}

func TestCreateChecks(t *testing.T) {
	pool, svc, clock := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	a1, b1 := give(t, pool, asha, "gaja-calf", 0, 1), give(t, pool, ben, "simha", 0, 1)
	b2 := give(t, pool, ben, "simha", 1, 1)

	cases := []struct {
		name string
		from uuid.UUID
		o    trades.NewOffer
		want error
	}{
		{"gift", asha, offer("ben", ids(a1), nil), game.ErrBadOffer},
		{"unknown player", asha, offer("nobody", ids(a1), ids(b1)), trades.ErrNoSuchPlayer},
		{"yourself", asha, offer("asha", ids(a1), ids(b1)), trades.ErrSelf},
		{"offering their card", asha, offer("ben", ids(b2), ids(b1)), trades.ErrNotOwned},
		{"asking for your own card", asha, offer("ben", ids(a1), ids(a1)), game.ErrBadOffer},
	}
	for _, c := range cases {
		if _, err := svc.Create(ctx, c.from, c.o); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}

	// A requested card in the recipient's own open offer can't be asked for.
	cara := newUser(t, pool, "cara")
	c1 := give(t, pool, cara, "ura", 0, 1)
	if _, err := svc.Create(ctx, ben, offer("cara", ids(b2), ids(c1))); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Create(ctx, asha, offer("ben", ids(a1), ids(b2))); !errors.Is(err, trades.ErrInTrade) {
		t.Errorf("asked for a card locked in another offer: %v", err)
	}

	// New accounts wait 7 days, on both sides.
	dan := newUser(t, pool, "dan")
	d1 := give(t, pool, dan, "malu", 0, 1)
	if _, err := pool.Exec(ctx, "UPDATE users SET trade_unlocked_at = $2 WHERE id = $1", dan, t0.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Create(ctx, dan, offer("asha", ids(d1), ids(a1))); !errors.Is(err, trades.ErrTradeLocked) {
		t.Errorf("new account sent an offer: %v", err)
	}
	if _, err := svc.Create(ctx, asha, offer("dan", ids(a1), ids(d1))); !errors.Is(err, trades.ErrRecipientLocked) {
		t.Errorf("offer to a new account: %v", err)
	}
	*clock = t0.Add(time.Hour)
	if _, err := svc.Create(ctx, dan, offer("asha", ids(d1), ids(a1))); err != nil {
		t.Errorf("after the lock: %v", err)
	}
}

func TestDailyLimitResetsAtMidnightUTC(t *testing.T) {
	pool, svc, clock := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	b1 := give(t, pool, ben, "simha", 0, 1)

	*clock = time.Date(2026, 11, 4, 23, 0, 0, 0, time.UTC)
	for i := range game.DailyTradeLimit {
		a := give(t, pool, asha, "gaja-calf", i, 1)
		if _, err := svc.Create(ctx, asha, offer("ben", ids(a), ids(b1))); err != nil {
			t.Fatalf("offer %d: %v", i+1, err)
		}
	}
	extra := give(t, pool, asha, "gaja-calf", 10, 1)
	if _, err := svc.Create(ctx, asha, offer("ben", ids(extra), ids(b1))); !errors.Is(err, trades.ErrDailyLimit) {
		t.Fatalf("offer over the limit: %v", err)
	}
	// Cancelled offers still count (or cancel + resend would get around the limit).
	*clock = time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)
	if _, err := svc.Create(ctx, asha, offer("ben", ids(extra), ids(b1))); err != nil {
		t.Errorf("next UTC day: %v", err)
	}
}

func TestDeclineAndCancel(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	a1, b1 := give(t, pool, asha, "gaja-calf", 0, 1), give(t, pool, ben, "simha", 0, 1)

	tr, err := svc.Create(ctx, asha, offer("ben", ids(a1), ids(b1)))
	if err != nil {
		t.Fatal(err)
	}
	// Only the recipient accepts or declines; only the sender cancels.
	if _, err := svc.Accept(ctx, asha, tr.ID); !errors.Is(err, trades.ErrNotFound) {
		t.Errorf("sender accepted: %v", err)
	}
	if _, err := svc.Cancel(ctx, ben, tr.ID); !errors.Is(err, trades.ErrNotFound) {
		t.Errorf("recipient cancelled: %v", err)
	}
	stranger := newUser(t, pool, "cara")
	if _, err := svc.Decline(ctx, stranger, tr.ID); !errors.Is(err, trades.ErrNotFound) {
		t.Errorf("stranger declined: %v", err)
	}
	done, err := svc.Decline(ctx, ben, tr.ID)
	if err != nil || done.Status != trades.StatusDeclined {
		t.Fatalf("decline: %+v %v", done.Status, err)
	}
	if s := state(t, pool, a1); s.locked || s.owner != asha {
		t.Errorf("after decline: %+v", s)
	}
	if _, err := svc.Cancel(ctx, asha, tr.ID); !isNotOpen(err, trades.StatusDeclined) {
		t.Errorf("cancel after decline: %v", err)
	}
}

func TestAcceptFailsWhenARequestedCardIsGone(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	a1 := give(t, pool, asha, "gaja-calf", 0, 1)
	b1, b2 := give(t, pool, ben, "simha", 0, 1), give(t, pool, ben, "simha", 1, 1)

	tr, err := svc.Create(ctx, asha, offer("ben", ids(a1), ids(b1)))
	if err != nil {
		t.Fatal(err)
	}
	// Ben merges the requested card away (requested cards aren't locked).
	if _, err := merges.NewService(pool).Merge(ctx, ben, b1, b2); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, ben, tr.ID); !errors.Is(err, trades.ErrUnavailable) {
		t.Fatalf("accept: %v", err)
	}
	list, err := svc.List(ctx, asha)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Status != trades.StatusFailed || list[0].Request[0].Card != nil {
		t.Fatalf("after the failed accept: %+v", list)
	}
	if s := state(t, pool, a1); s.locked || s.owner != asha {
		t.Errorf("offered card after failure: %+v", s)
	}
}

func TestOffersExpireAfter48Hours(t *testing.T) {
	pool, svc, clock := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	a1, a2 := give(t, pool, asha, "gaja-calf", 0, 1), give(t, pool, asha, "malu", 0, 1)
	b1 := give(t, pool, ben, "simha", 0, 1)

	first, err := svc.Create(ctx, asha, offer("ben", ids(a1), ids(b1)))
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.Create(ctx, asha, offer("ben", ids(a2), ids(b1)))
	if err != nil {
		t.Fatal(err)
	}

	*clock = t0.Add(48*time.Hour - time.Second)
	if n, err := svc.Expire(ctx); err != nil || n != 0 {
		t.Fatalf("expired %d early (%v)", n, err)
	}
	*clock = t0.Add(48 * time.Hour)
	if _, err := svc.Accept(ctx, ben, first.ID); !errors.Is(err, trades.ErrExpired) {
		t.Errorf("accept at 48h: %v", err)
	}
	if s := state(t, pool, a1); s.locked || s.owner != asha {
		t.Errorf("card of the expired offer: %+v", s)
	}
	// The job expires the other one and frees its card.
	if n, err := svc.Expire(ctx); err != nil || n != 1 {
		t.Fatalf("job expired %d (%v), want 1", n, err)
	}
	if state(t, pool, a2).locked {
		t.Error("card still locked after expiry")
	}
	if _, err := svc.Decline(ctx, ben, second.ID); !isNotOpen(err, trades.StatusExpired) {
		t.Errorf("decline after expiry: %v", err)
	}
}

func TestTradedCardsEarnNoPointsEvenAfterMerging(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	a1 := give(t, pool, asha, "gaja-calf", 0, 1)
	b1 := give(t, pool, ben, "simha", 0, 1)
	a2 := give(t, pool, asha, "gaja-calf", 1, 1) // Asha's own, not traded

	tr, err := svc.Create(ctx, ben, offer("asha", ids(b1), ids(a1)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, asha, tr.ID); err != nil {
		t.Fatal(err)
	}
	// Ben now owns a1 (traded); give him another Gaja Calf of his own and merge them.
	b2 := give(t, pool, ben, "gaja-calf", 2, 1)
	ms := merges.NewService(pool)
	ms.Now = func() time.Time { return t0 }
	res, err := ms.Merge(ctx, ben, b2, a1)
	if err != nil {
		t.Fatal(err)
	}
	if res.Points != 0 {
		t.Errorf("merge with a traded card earned %d points", res.Points)
	}
	if !state(t, pool, res.Card.ID).traded {
		t.Error("card merged from a traded card isn't marked traded")
	}
	// A merge of untraded cards still earns points.
	a3 := give(t, pool, asha, "gaja-calf", 3, 1)
	res, err = ms.Merge(ctx, asha, a3, a2)
	if err != nil || res.Points == 0 {
		t.Errorf("normal merge: %d points, %v", res.Points, err)
	}
}

// Two accepts of the same offer at once (two devices, or a double tap): exactly
// one swaps, and no card ends up duplicated or with the wrong owner.
func TestConcurrentAcceptsSwapOnce(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	for round := range 10 {
		a := give(t, pool, asha, "gaja-calf", round, 1)
		b := give(t, pool, ben, "simha", round, 1)
		tr, err := svc.Create(ctx, asha, offer("ben", ids(a), ids(b)))
		if err != nil {
			t.Fatal(err)
		}
		// The daily limit isn't what's tested here.
		if _, err := pool.Exec(ctx, "UPDATE trades SET created_at = created_at - interval '1 day'"); err != nil {
			t.Fatal(err)
		}

		var wg sync.WaitGroup
		errs := make([]error, 2)
		for i := range errs {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, errs[i] = svc.Accept(ctx, ben, tr.ID)
			}()
		}
		wg.Wait()
		ok := 0
		for _, err := range errs {
			switch {
			case err == nil:
				ok++
			case isNotOpen(err, trades.StatusAccepted):
			default:
				t.Fatalf("round %d: unexpected error %v", round, err)
			}
		}
		if ok != 1 {
			t.Fatalf("round %d: %d accepts succeeded, want 1", round, ok)
		}
		if state(t, pool, a).owner != ben || state(t, pool, b).owner != asha {
			t.Fatalf("round %d: cards not swapped exactly once", round)
		}
	}
	var cards, distinct int
	if err := pool.QueryRow(ctx, "SELECT count(*), count(DISTINCT (season_card_id, copy_no)) FROM cards WHERE acquired_via <> 'gift'").Scan(&cards, &distinct); err != nil {
		t.Fatal(err)
	}
	if cards != 20 || distinct != 20 {
		t.Errorf("%d cards (%d distinct), want 20: a card was duplicated or lost", cards, distinct)
	}
}

// Accept and cancel racing: either the swap happens or the offer is cancelled, never both.
func TestAcceptRacingCancel(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	for round := range 10 {
		a := give(t, pool, asha, "gaja-calf", round, 1)
		b := give(t, pool, ben, "simha", round, 1)
		tr, err := svc.Create(ctx, asha, offer("ben", ids(a), ids(b)))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, "UPDATE trades SET created_at = created_at - interval '1 day'"); err != nil {
			t.Fatal(err)
		}
		var wg sync.WaitGroup
		var acceptErr, cancelErr error
		wg.Add(2)
		go func() { defer wg.Done(); _, acceptErr = svc.Accept(ctx, ben, tr.ID) }()
		go func() { defer wg.Done(); _, cancelErr = svc.Cancel(ctx, asha, tr.ID) }()
		wg.Wait()

		accepted := acceptErr == nil && isNotOpen(cancelErr, trades.StatusAccepted)
		cancelled := cancelErr == nil && isNotOpen(acceptErr, trades.StatusCancelled)
		if accepted == cancelled {
			t.Fatalf("round %d: accept %v, cancel %v", round, acceptErr, cancelErr)
		}
		sa, sb := state(t, pool, a), state(t, pool, b)
		if accepted && (sa.owner != ben || sb.owner != asha) || cancelled && (sa.owner != asha || sb.owner != ben || sa.locked) {
			t.Fatalf("round %d: cards %+v %+v don't match the outcome", round, sa, sb)
		}
	}
}

// The same card offered in two offers at once: only one gets it.
func TestConcurrentOffersOfOneCard(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben, cara := newUser(t, pool, "asha"), newUser(t, pool, "ben"), newUser(t, pool, "cara")
	a1 := give(t, pool, asha, "gaja-calf", 0, 1)
	b1, c1 := give(t, pool, ben, "simha", 0, 1), give(t, pool, cara, "ura", 0, 1)

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, o := range []trades.NewOffer{offer("ben", ids(a1), ids(b1)), offer("cara", ids(a1), ids(c1))} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = svc.Create(ctx, asha, o)
		}()
	}
	wg.Wait()
	ok := 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, trades.ErrInTrade):
		default:
			t.Fatalf("unexpected error %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("%d offers got the card, want 1", ok)
	}
}
