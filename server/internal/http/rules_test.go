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
	// The pack odds the Help screen shows are the ones packs are rolled with.
	odds := got.DropChancePercent
	if got.PityPacks != game.PityPacks || odds.Common != float32(game.DropChance[game.Common]) || odds.Legendary != float32(game.DropChance[game.Legendary]) {
		t.Errorf("pack odds %+v, pity %d", odds, got.PityPacks)
	}
}
