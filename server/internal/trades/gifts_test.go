package trades_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/trades"
)

// gifts counts each player's gift cards.
func gifts(t *testing.T, pool *pgxpool.Pool) map[uuid.UUID]int {
	t.Helper()
	rows, err := pool.Query(context.Background(), "SELECT owner_id, count(*) FROM cards WHERE acquired_via = 'gift' GROUP BY owner_id")
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

func TestFirstTradeGivesBothPlayersAGift(t *testing.T) {
	pool, svc, _ := setup(t)
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")

	done := trade(t, pool, svc, asha, ben, "ben")
	if len(done.Gifts) != 2 {
		t.Fatalf("gifts %+v", done.Gifts)
	}
	for _, u := range []uuid.UUID{asha, ben} {
		g, ok := done.GiftFor(u)
		if !ok || g.Card == nil {
			t.Fatalf("no gift for %s: %+v", u, done.Gifts)
		}
		if g.Card.OwnerID != u || g.Card.Level != 1 || g.Card.AcquiredVia != "gift" || g.Card.InTrade {
			t.Errorf("gift %+v", g.Card)
		}
		if r := game.Rarity(g.Card.Rarity); r != game.Common && r != game.Uncommon {
			t.Errorf("gift rarity %s", r)
		}
		// Gifts count as traded, so they never turn into season points.
		if s := state(t, pool, g.CardID); !s.traded {
			t.Errorf("gift not marked traded: %+v", s)
		}
	}
	var points int
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM season_points").Scan(&points); err != nil || points != 0 {
		t.Errorf("season points rows %d (%v)", points, err)
	}

	// Trading again with the same partner (either direction) gives nothing.
	if again := trade(t, pool, svc, ben, asha, "asha"); len(again.Gifts) != 0 {
		t.Errorf("second trade gifts %+v", again.Gifts)
	}
	if g := gifts(t, pool); g[asha] != 1 || g[ben] != 1 {
		t.Errorf("gifts %v", g)
	}
	// A list shows each trade's gifts too.
	list, err := svc.List(context.Background(), asha)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || len(list[0].Gifts)+len(list[1].Gifts) != 2 {
		t.Errorf("listed gifts %+v", list)
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
	g := gifts(t, pool)
	if g[asha] != game.PartnerGiftsPerWeek || g[others["ben"]] != 1 || g[others["cara"]] != 1 || g[others["dev"]] != 1 {
		t.Fatalf("gifts %v", g)
	}
	// Next Monday the cap starts over.
	*clock = time.Date(2026, 11, 9, 0, 1, 0, 0, time.UTC)
	if done := trade(t, pool, svc, others["eli"], asha, "asha"); len(done.Gifts) != 2 {
		t.Errorf("next week gifts %+v", done.Gifts)
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
	ben2, err := svc.Create(ctx, asha, offer("ben", ids(give(t, pool, asha, "simha", 0, 1)), ids(give(t, pool, others(t, pool, "ben"), "ura", 0, 1))))
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
	go func() { defer wg.Done(); _, errs[len(offers)] = svc.Accept(ctx, others(t, pool, "ben"), ben2.ID) }()
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("accept %d: %v", i, err)
		}
	}
	g := gifts(t, pool)
	if g[asha] != game.PartnerGiftsPerWeek || g[others(t, pool, "ben")] != 1 {
		t.Errorf("gifts %v", g)
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
