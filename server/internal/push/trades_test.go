package push_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"cardgame/server/internal/push"
)

func TestTradeMessages(t *testing.T) {
	id := uuid.New()
	m, ok := push.TradeMessage("trade.received", "Asha the Brave", id)
	if !ok || m.Title != "New trade offer" || m.Body != "Asha the Brave sent you a trade offer. Tap to see what they want to swap." ||
		m.URL != push.TradesURL || m.Tag != "trade-"+id.String() {
		t.Errorf("received: %+v %v", m, ok)
	}
	if m, ok := push.TradeMessage("trade.accepted", "ben", id); !ok || m.Title != "Trade accepted" || m.Body != "ben accepted your trade. Your new cards are in your collection." {
		t.Errorf("accepted: %+v %v", m, ok)
	}
	for _, quiet := range []string{"trade.declined", "trade.cancelled", "trade.expired", "trade.failed", "other"} {
		if _, ok := push.TradeMessage(quiet, "ben", id); ok {
			t.Errorf("%s gets a notification", quiet)
		}
	}
}

func TestTradePushGoesToTheRecipientsDevicesUnlessTurnedOff(t *testing.T) {
	pool, sender, svc := setup(t)
	ctx := context.Background()
	asha := newUser(t, pool, "asha")
	ben := newUser(t, pool, "ben")
	subscribe(t, svc, ben, "ben-phone")
	subscribe(t, svc, ben, "ben-laptop")
	subscribe(t, svc, asha, "asha-phone")
	if _, err := pool.Exec(ctx, "UPDATE users SET public_name = 'Asha the Brave' WHERE id = $1", asha); err != nil {
		t.Fatal(err)
	}
	trade := uuid.New()

	n, err := svc.SendTrade(ctx, push.TradeEvent{To: ben, Type: "trade.received", TradeID: trade, By: "asha"})
	if err != nil || n != 2 {
		t.Fatalf("sent %d, %v", n, err)
	}
	eq(t, "ben's devices", sender.endpoints(), endpoint("ben-laptop"), endpoint("ben-phone"))
	var msg push.Message
	if err := json.Unmarshal(sender.body, &msg); err != nil || msg.Body != "Asha the Brave sent you a trade offer. Tap to see what they want to swap." {
		t.Fatalf("message %+v, %v", msg, err)
	}

	// Quiet events and players without devices send nothing.
	if n, _ := svc.SendTrade(ctx, push.TradeEvent{To: ben, Type: "trade.declined", TradeID: trade, By: "asha"}); n != 0 {
		t.Errorf("declined sent %d", n)
	}
	if n, _ := svc.SendTrade(ctx, push.TradeEvent{To: newUser(t, pool, "cara"), Type: "trade.received", TradeID: trade, By: "asha"}); n != 0 {
		t.Errorf("no devices sent %d", n)
	}

	// Turned off: nothing; back on: delivered again.
	if err := svc.SetTradeNotices(ctx, ben, false); err != nil {
		t.Fatal(err)
	}
	if n, _ := svc.SendTrade(ctx, push.TradeEvent{To: ben, Type: "trade.accepted", TradeID: trade, By: "asha"}); n != 0 {
		t.Errorf("turned off but sent %d", n)
	}
	_ = svc.SetTradeNotices(ctx, ben, true)
	if n, _ := svc.SendTrade(ctx, push.TradeEvent{To: ben, Type: "trade.accepted", TradeID: trade, By: "asha"}); n != 2 {
		t.Errorf("back on: sent %d", n)
	}
	sender.endpoints()

	// A player who never chose a name is called by their username.
	if _, err := svc.SendTrade(ctx, push.TradeEvent{To: asha, Type: "trade.accepted", TradeID: trade, By: "ben"}); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(sender.body, &msg); err != nil || msg.Body != "ben accepted your trade. Your new cards are in your collection." {
		t.Fatalf("message %+v, %v", msg, err)
	}
}
