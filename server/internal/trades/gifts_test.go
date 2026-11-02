package trades_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/trades"
)

// waiting counts each player's unopened gifts.
func waiting(t *testing.T, pool *pgxpool.Pool) map[uuid.UUID]int {
	t.Helper()
	rows, err := pool.Query(context.Background(), "SELECT user_id, count(*) FROM trade_gifts WHERE opened_at IS NULL GROUP BY user_id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[uuid.UUID]int{}
	for rows.Next() {
		var u uuid.UUID
		var n int
		if err := rows.Scan(&u, &n); err != nil {
			t.Fatal(err)
		}
		out[u] = n
	}
	return out
}

// trade has `from` offer a fresh card for a fresh card of `to`, and `to` accept it.
func trade(t *testing.T, pool *pgxpool.Pool, svc *trades.Service, from, to uuid.UUID, toName string) trades.Trade {
	t.Helper()
	ctx := context.Background()
	tr, err := svc.Create(ctx, from, offer(toName, ids(give(t, pool, from, "gaja-calf", 0, 1)), ids(give(t, pool, to, "malu", 0, 1))))
	if err != nil {
		t.Fatal(err)
	}
	done, err := svc.Accept(ctx, to, tr.ID)
	if err != nil {
		t.Fatal(err)
	}
	return done
}

func TestFirstTradeGivesBothPlayersAGiftToOpen(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")

	done := trade(t, pool, svc, asha, ben, "ben")
	if !done.Gifted(asha) || !done.Gifted(ben) {
		t.Fatalf("gifted %v", done.GiftedTo)
	}
	// The gift waits on the Pack tab: no card until it is opened.
	var giftCards int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM cards WHERE acquired_via = 'gift'").Scan(&giftCards); err != nil || giftCards != 0 {
		t.Fatalf("gift cards before opening: %d (%v)", giftCards, err)
	}
	if n, err := svc.WaitingGifts(ctx, asha); err != nil || n != 1 {
		t.Fatalf("asha waiting %d (%v)", n, err)
	}

	opened, err := svc.OpenGifts(ctx, asha)
	if err != nil {
		t.Fatal(err)
	}
	if len(opened) != 1 || opened[0].Partner != "ben" || opened[0].TradeID != done.ID {
		t.Fatalf("opened %+v", opened)
	}
	c := opened[0].Card
	if c.OwnerID != asha || c.Level != 1 || c.AcquiredVia != "gift" || c.InTrade {
		t.Errorf("gift %+v", c)
	}
	if r := game.Rarity(c.Rarity); r != game.Common && r != game.Uncommon {
		t.Errorf("gift rarity %s", r)
	}
	// Gifts count as traded, so they never turn into season points.
	if s := state(t, pool, c.ID); !s.traded {
		t.Errorf("gift not marked traded: %+v", s)
	}
	var points int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM season_points").Scan(&points); err != nil || points != 0 {
		t.Errorf("season points rows %d (%v)", points, err)
	}
	// Opened once; Ben's is still his to open.
	if _, err := svc.OpenGifts(ctx, asha); !errors.Is(err, trades.ErrNoGifts) {
		t.Errorf("open again: %v", err)
	}
	if w := waiting(t, pool); w[asha] != 0 || w[ben] != 1 {
		t.Errorf("waiting %v", w)
	}

	// Trading again with the same partner (either direction) gives nothing.
	if again := trade(t, pool, svc, ben, asha, "asha"); len(again.GiftedTo) != 0 {
		t.Errorf("second trade gifts %v", again.GiftedTo)
	}
	if w := waiting(t, pool); w[asha] != 0 || w[ben] != 1 {
		t.Errorf("waiting after a second trade %v", w)
	}
}

func TestPartnerGiftsAreCappedPerWeek(t *testing.T) {
	pool, svc, clock := setup(t)
	asha := newUser(t, pool, "asha")
	names := []string{"ben", "cara", "dev", "eli"}
	others := map[string]uuid.UUID{}
	for _, n := range names {
		others[n] = newUser(t, pool, n)
	}
	for _, n := range names[:3] {
		trade(t, pool, svc, others[n], asha, "asha")
	}
	// Asha's third new partner this week still gets their gift; Asha doesn't.
	w := waiting(t, pool)
	if w[asha] != game.PartnerGiftsPerWeek || w[others["ben"]] != 1 || w[others["cara"]] != 1 || w[others["dev"]] != 1 {
		t.Fatalf("waiting %v", w)
	}
	// Next Monday the cap starts over.
	*clock = time.Date(2026, 11, 9, 0, 1, 0, 0, time.UTC)
	if done := trade(t, pool, svc, others["eli"], asha, "asha"); len(done.GiftedTo) != 2 {
		t.Errorf("next week gifts %v", done.GiftedTo)
	}
	// All waiting gifts open together, oldest first (last week's two, then this week's).
	opened, err := svc.OpenGifts(context.Background(), asha)
	if err != nil {
		t.Fatal(err)
	}
	if len(opened) != 3 || opened[2].Partner != "eli" {
		t.Errorf("opened %+v", opened)
	}
}

func TestGiftCapHoldsForTradesAcceptedAtOnce(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha := newUser(t, pool, "asha")
	var offers []uuid.UUID
	for _, n := range []string{"ben", "cara", "dev", "eli"} {
		u := newUser(t, pool, n)
		tr, err := svc.Create(ctx, u, offer("asha", ids(give(t, pool, u, "gaja-calf", 0, 1)), ids(give(t, pool, asha, "malu", 0, 1))))
		if err != nil {
			t.Fatal(err)
		}
		offers = append(offers, tr.ID)
	}
	// The same two players twice at once: one pair of gifts.
	ben := others(t, pool, "ben")
	ben2, err := svc.Create(ctx, asha, offer("ben", ids(give(t, pool, asha, "simha", 0, 1)), ids(give(t, pool, ben, "ura", 0, 1))))
	if err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	errs := make([]error, len(offers)+1)
	for i, id := range offers {
		wg.Add(1)
		go func() { defer wg.Done(); _, errs[i] = svc.Accept(ctx, asha, id) }()
	}
	wg.Add(1)
	go func() { defer wg.Done(); _, errs[len(offers)] = svc.Accept(ctx, ben, ben2.ID) }()
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("accept %d: %v", i, err)
		}
	}
	if w := waiting(t, pool); w[asha] != game.PartnerGiftsPerWeek || w[ben] != 1 {
		t.Errorf("waiting %v", w)
	}
}

func TestOpeningAtOnceOpensEachGiftOnce(t *testing.T) {
	pool, svc, _ := setup(t)
	ctx := context.Background()
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	trade(t, pool, svc, asha, ben, "ben")

	var wg sync.WaitGroup
	results := make([][]trades.OpenedGift, 4)
	errs := make([]error, 4)
	for i := range results {
		wg.Add(1)
		go func() { defer wg.Done(); results[i], errs[i] = svc.OpenGifts(ctx, ben) }()
	}
	wg.Wait()
	cards := 0
	for i := range results {
		if errs[i] != nil && !errors.Is(errs[i], trades.ErrNoGifts) {
			t.Fatalf("open %d: %v", i, errs[i])
		}
		cards += len(results[i])
	}
	var minted int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM cards WHERE owner_id = $1 AND acquired_via = 'gift'", ben).Scan(&minted); err != nil {
		t.Fatal(err)
	}
	if cards != 1 || minted != 1 {
		t.Errorf("opened %d gifts, %d gift cards; want 1", cards, minted)
	}
}

// others looks a player up by username.
func others(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := pool.QueryRow(context.Background(), "SELECT id FROM users WHERE username = $1", name).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
