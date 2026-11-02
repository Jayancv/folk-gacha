package game

import (
	"errors"
	"testing"
	"time"
)

func TestCheckOffer(t *testing.T) {
	ok := []struct {
		name           string
		offer, request []int
	}{
		{"one for one", []int{1}, []int{2}},
		{"five for five", []int{1, 2, 3, 4, 5}, []int{6, 7, 8, 9, 10}},
		{"uneven sides", []int{1, 2, 3}, []int{4}},
	}
	for _, c := range ok {
		if err := CheckOffer(c.offer, c.request); err != nil {
			t.Errorf("%s: %v", c.name, err)
		}
	}
	bad := []struct {
		name           string
		offer, request []int
	}{
		{"gift (nothing asked)", []int{1}, nil},
		{"request only", nil, []int{1}},
		{"six offered", []int{1, 2, 3, 4, 5, 6}, []int{7}},
		{"six requested", []int{1}, []int{2, 3, 4, 5, 6, 7}},
		{"same card twice in offer", []int{1, 1}, []int{2}},
		{"same card on both sides", []int{1}, []int{1}},
	}
	for _, c := range bad {
		if err := CheckOffer(c.offer, c.request); !errors.Is(err, ErrBadOffer) {
			t.Errorf("%s: err = %v, want ErrBadOffer", c.name, err)
		}
	}
}

func TestCanTradeAfterTheWait(t *testing.T) {
	r := CurrentRules()
	t.Cleanup(func() { UseRules(r) })
	joined := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	if !CanTrade(joined, joined) {
		t.Error("game.yaml has no wait: an account trades from sign-up")
	}

	wait := r
	wait.Trading.NewAccountWaitDays = 7
	UseRules(wait)
	unlock := joined.AddDate(0, 0, 7)
	if !TradeUnlocksAt(joined).Equal(unlock) {
		t.Errorf("unlocks %v", TradeUnlocksAt(joined))
	}
	if CanTrade(joined, unlock.Add(-time.Second)) {
		t.Error("traded a second before the unlock")
	}
	if !CanTrade(joined, unlock) || !CanTrade(joined, unlock.Add(time.Hour)) {
		t.Error("can't trade at or after the unlock")
	}
}

func TestTradeTimes(t *testing.T) {
	created := time.Date(2026, 10, 31, 23, 59, 0, 0, time.UTC)
	if got := TradeExpiresAt(created); !got.Equal(created.Add(48 * time.Hour)) {
		t.Errorf("expires %v", got)
	}
	// The daily limit resets at 00:00 UTC, like packs.
	if got := TradeDay(created); !got.Equal(time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("day %v", got)
	}
	if got := TradeDay(created.Add(2 * time.Minute)); !got.Equal(time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("day after midnight %v", got)
	}
}

func TestMergedTradedSticks(t *testing.T) {
	if MergedTraded(false, false) || !MergedTraded(true, false) || !MergedTraded(false, true) {
		t.Error("a merge with a traded card must stay traded")
	}
}

type fixed float64

func (f fixed) Float64() float64 { return float64(f) }

func TestGiftRarityIsCommonOrUncommon(t *testing.T) {
	for _, c := range []struct {
		roll float64
		want Rarity
	}{{0, Common}, {0.77, Common}, {0.78, Uncommon}, {0.999999, Uncommon}} {
		if got := GiftRarity(fixed(c.roll)); got != c.want {
			t.Errorf("roll %v: %s, want %s", c.roll, got, c.want)
		}
	}
}

func TestGiftWeekIsTheLeaderboardWeek(t *testing.T) {
	sun := time.Date(2026, 11, 1, 23, 59, 0, 0, time.UTC)
	if GiftWeek(sun) != "2026-W44" || GiftWeek(sun.Add(2*time.Minute)) != "2026-W45" {
		t.Errorf("weeks %s %s", GiftWeek(sun), GiftWeek(sun.Add(2*time.Minute)))
	}
}
