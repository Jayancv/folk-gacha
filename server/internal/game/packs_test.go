package game

import (
	"math"
	"math/rand/v2"
	"slices"
	"testing"
	"time"
)

// seq returns the given values in order, then repeats the last one.
type seq []float64

func (s *seq) Float64() float64 {
	v := (*s)[0]
	if len(*s) > 1 {
		*s = (*s)[1:]
	}
	return v
}

func rolls(v ...float64) *seq { s := seq(v); return &s }

func TestDropChancesSumTo100(t *testing.T) {
	sum := 0.0
	for _, r := range Rarities {
		sum += DropChance[r]
	}
	if math.Abs(sum-100) > 1e-9 {
		t.Fatalf("drop chances sum to %v", sum)
	}
}

func TestRollRarityBoundaries(t *testing.T) {
	tests := []struct {
		u    float64
		want Rarity
	}{
		{0, Common}, {0.6999, Common}, {0.70, Uncommon}, {0.8999, Uncommon},
		{0.90, Rare}, {0.9799, Rare}, {0.98, Epic}, {0.9979, Epic}, {0.9981, Legendary}, {0.99999, Legendary},
	}
	for _, tt := range tests {
		if got := RollRarity(rolls(tt.u)); got != tt.want {
			t.Errorf("u=%v: got %s, want %s", tt.u, got, tt.want)
		}
	}
}

func TestRollRarityMatchesOddsOverManyRolls(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	const n = 200_000
	got := map[Rarity]int{}
	for range n {
		got[RollRarity(rng)]++
	}
	for _, r := range Rarities {
		pct := 100 * float64(got[r]) / n
		// Generous tolerance: ~5 standard deviations for the rarest tier.
		if tol := 0.1 + DropChance[r]*0.03; math.Abs(pct-DropChance[r]) > tol {
			t.Errorf("%s: %.3f%%, want %.1f%% ± %.2f", r, pct, DropChance[r], tol)
		}
	}
}

func TestRollPackHasFiveCards(t *testing.T) {
	if got := RollPack(rolls(0), 0); len(got) != PackSize {
		t.Fatalf("pack size = %d", len(got))
	}
}

func TestPityRaisesOneSlotOnTheSeventhDryPack(t *testing.T) {
	// Five commons, then 0.5 picks the middle slot to raise.
	got := RollPack(rolls(0, 0, 0, 0, 0, 0.5), PityPacks-1)
	want := []Rarity{Common, Common, Rare, Common, Common}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestNoPityBeforeTheSeventhPack(t *testing.T) {
	got := RollPack(rolls(0), PityPacks-2)
	if slices.ContainsFunc(got, Rarity.AtLeastRare) {
		t.Fatalf("pity kicked in early: %v", got)
	}
}

func TestPityLeavesALuckyPackAlone(t *testing.T) {
	// An Epic was rolled anyway: nothing is changed.
	got := RollPack(rolls(0, 0.985, 0), PityPacks-1)
	want := []Rarity{Common, Epic, Common, Common, Common}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestDryPacksAfter(t *testing.T) {
	commons := []Rarity{Common, Common, Uncommon, Common, Common}
	if got := DryPacksAfter(3, commons); got != 4 {
		t.Fatalf("dry pack: got %d, want 4", got)
	}
	if got := DryPacksAfter(3, append(commons[:4:4], Legendary)); got != 0 {
		t.Fatalf("lucky pack: got %d, want 0", got)
	}
}

// Over many simulated players, no one ever goes PityPacks packs without a Rare.
func TestPityGuaranteeHolds(t *testing.T) {
	rng := rand.New(rand.NewPCG(7, 7))
	for range 2000 {
		dry := 0
		for range 60 {
			dry = DryPacksAfter(dry, RollPack(rng, dry))
			if dry >= PityPacks {
				t.Fatalf("went %d packs without a Rare", dry)
			}
		}
	}
}

func TestWeightedIndex(t *testing.T) {
	w := []float64{1, 0, 3}
	if got := WeightedIndex(rolls(0.2), w); got != 0 {
		t.Fatalf("got %d, want 0", got)
	}
	if got := WeightedIndex(rolls(0.3), w); got != 2 {
		t.Fatalf("got %d, want 2 (zero weight skipped)", got)
	}
	if got := WeightedIndex(rolls(0.99999), w); got != 2 {
		t.Fatalf("got %d, want 2", got)
	}
	if got := WeightedIndex(rolls(0.5), []float64{0, -1}); got != -1 {
		t.Fatalf("got %d, want -1", got)
	}
}

func TestFallbackRarity(t *testing.T) {
	only := func(rs ...Rarity) func(Rarity) bool {
		return func(r Rarity) bool { return slices.Contains(rs, r) }
	}
	tests := []struct {
		name  string
		want  Rarity
		avail func(Rarity) bool
		got   Rarity
		ok    bool
	}{
		{"available", Legendary, only(Common, Legendary), Legendary, true},
		{"sold out steps down", Legendary, only(Common, Rare), Rare, true},
		{"nothing below steps up", Common, only(Epic), Epic, true},
		{"all sold out", Rare, only(), "", false},
	}
	for _, tt := range tests {
		got, ok := FallbackRarity(tt.want, tt.avail)
		if got != tt.got || ok != tt.ok {
			t.Errorf("%s: got %q %v, want %q %v", tt.name, got, ok, tt.got, tt.ok)
		}
	}
}

func TestLevelScore(t *testing.T) {
	// Same numbers as the web's levelScore (fakePack.ts).
	for level, want := range map[int]int{1: 10, 2: 22, 3: 48, 4: 106, 5: 234} {
		if got := LevelScore(10, level); got != want {
			t.Errorf("level %d: got %d, want %d", level, got, want)
		}
	}
}

func TestClaimDayAroundMidnightUTC(t *testing.T) {
	day := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	tests := []struct {
		name string
		at   time.Time
		want time.Time
	}{
		{"23:59:59 counts for that day", time.Date(2026, 10, 30, 23, 59, 59, 999_999_999, time.UTC), day},
		{"00:00 is the next day", time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC), day.AddDate(0, 0, 1)},
		// 23:30 in Colombo (UTC+5:30) is 18:00 UTC the same day.
		{"local time zones don't matter", time.Date(2026, 10, 30, 23, 30, 0, 0, time.FixedZone("IST", 5*3600+1800)), day},
		// 02:00 in Colombo on the 31st is still the 30th in UTC.
		{"after local midnight, before UTC midnight", time.Date(2026, 10, 31, 2, 0, 0, 0, time.FixedZone("IST", 5*3600+1800)), day},
	}
	for _, tt := range tests {
		if got := ClaimDay(tt.at); !got.Equal(tt.want) || got.Location() != time.UTC {
			t.Errorf("%s: got %v, want %v", tt.name, got, tt.want)
		}
	}
}

func TestNextReset(t *testing.T) {
	at := time.Date(2026, 12, 31, 23, 59, 0, 0, time.UTC)
	if got, want := NextReset(at), time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC); !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	midnight := time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC)
	if got := NextReset(midnight); !got.Equal(midnight.AddDate(0, 0, 1)) {
		t.Fatalf("a claim at exactly 00:00 waits for the following midnight, got %v", got)
	}
}
