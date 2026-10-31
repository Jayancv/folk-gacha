package httpapi

import (
	"testing"

	"cardgame/server/internal/game"
)

func TestRulesArePublic(t *testing.T) {
	ts := newTestServer(AuthOptions{})
	rec := ts.do(t, "GET", "/rules", "", nil)
	if rec.Code != 200 {
		t.Fatalf("rules: %d %s", rec.Code, rec.Body)
	}
	got := decode[GameRules](t, rec)
	if got.MaxTradeCards != game.MaxTradeCards || got.DailyOfferLimit != game.DailyTradeLimit || got.OfferExpiryHours != int(game.TradeExpiry.Hours()) {
		t.Errorf("rules %+v", got)
	}
}
