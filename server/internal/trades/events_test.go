package trades_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"cardgame/server/internal/trades"
)

type events struct {
	mu   sync.Mutex
	list []trades.Event
}

func (e *events) add(ev trades.Event) { e.mu.Lock(); e.list = append(e.list, ev); e.mu.Unlock() }

// take returns the events so far and starts over.
func (e *events) take() []trades.Event {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := e.list
	e.list = nil
	return out
}

func TestEveryChangeTellsTheOtherPlayer(t *testing.T) {
	pool, svc, clock := setup(t)
	ctx := context.Background()
	got := &events{}
	svc.OnEvent = got.add
	asha, ben := newUser(t, pool, "asha"), newUser(t, pool, "ben")
	newOffer := func() trades.Trade {
		t.Helper()
		tr, err := svc.Create(ctx, asha, offer("ben", ids(give(t, pool, asha, "gaja-calf", 0, 1)), ids(give(t, pool, ben, "malu", 0, 1))))
		if err != nil {
			t.Fatal(err)
		}
		return tr
	}
	expect := func(step string, want ...trades.Event) {
		t.Helper()
		list := got.take()
		if len(list) != len(want) {
			t.Fatalf("%s: events %+v, want %+v", step, list, want)
		}
		for i := range want {
			if list[i] != want[i] {
				t.Errorf("%s: event %+v, want %+v", step, list[i], want[i])
			}
		}
	}

	tr := newOffer()
	expect("create", trades.Event{To: ben, Type: trades.EventReceived, TradeID: tr.ID, By: "asha"})
	if _, err := svc.Accept(ctx, ben, tr.ID); err != nil {
		t.Fatal(err)
	}
	expect("accept", trades.Event{To: asha, Type: "trade.accepted", TradeID: tr.ID, By: "ben"})

	tr = newOffer()
	got.take()
	if _, err := svc.Decline(ctx, ben, tr.ID); err != nil {
		t.Fatal(err)
	}
	expect("decline", trades.Event{To: asha, Type: "trade.declined", TradeID: tr.ID, By: "ben"})

	tr = newOffer()
	got.take()
	if _, err := svc.Cancel(ctx, asha, tr.ID); err != nil {
		t.Fatal(err)
	}
	expect("cancel", trades.Event{To: ben, Type: "trade.cancelled", TradeID: tr.ID, By: "asha"})

	// A refused action (not open any more) tells nobody.
	if _, err := svc.Cancel(ctx, asha, tr.ID); err == nil {
		t.Fatal("cancelled twice")
	}
	expect("cancel again")

	// The expiry job tells both players.
	tr = newOffer()
	got.take()
	*clock = clock.Add(49 * time.Hour)
	if n, err := svc.Expire(ctx); err != nil || n != 1 {
		t.Fatalf("expire: %d %v", n, err)
	}
	ev := func(u uuid.UUID) trades.Event { return trades.Event{To: u, Type: "trade.expired", TradeID: tr.ID} }
	expect("expire", ev(asha), ev(ben))
}
