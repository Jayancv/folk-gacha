package game

import (
	"math"
	"slices"
	"time"
)

// Rarity of a card, from most to least common.
type Rarity string

const (
	Common    Rarity = "common"
	Uncommon  Rarity = "uncommon"
	Rare      Rarity = "rare"
	Epic      Rarity = "epic"
	Legendary Rarity = "legendary"
)

// Rarities in order, most common first.
var Rarities = []Rarity{Common, Uncommon, Rare, Epic, Legendary}

// From server/rules/game.yaml (see rules.go).
var (
	// DropChance per card, in percent. Sums to 100.
	DropChance map[Rarity]float64
	// PityPacks: at least one Rare or better every PityPacks daily packs.
	PityPacks int
)

const (
	// PackSize is the number of cards in a daily pack.
	PackSize = 5
	// MaxLevel is the highest card level.
	MaxLevel = 5
	// LevelMultiplier: each level up multiplies a card's score by about this much.
	LevelMultiplier = 2.2
)

// Rand is the randomness the rolls need. *math/rand/v2.Rand satisfies it.
type Rand interface {
	Float64() float64
}

// Rank orders rarities: common = 0 … legendary = 4. Unknown rarities rank -1.
func (r Rarity) Rank() int { return slices.Index(Rarities, r) }

// AtLeastRare reports whether r counts for the pity rule.
func (r Rarity) AtLeastRare() bool { return r.Rank() >= Rare.Rank() }

// RollRarity picks one card's rarity by DropChance.
func RollRarity(rng Rand) Rarity {
	t := rng.Float64() * 100
	for _, r := range Rarities {
		if t -= DropChance[r]; t < 0 {
			return r
		}
	}
	return Common // only reachable through float rounding at t ≈ 100
}

// RollPack rolls the rarities of a daily pack. dryPacks is how many packs in a
// row the player has opened without a Rare or better; when this pack would be
// the PityPacks-th dry one, a random slot is raised to Rare.
func RollPack(rng Rand, dryPacks int) []Rarity {
	slots := make([]Rarity, PackSize)
	for i := range slots {
		slots[i] = RollRarity(rng)
	}
	if dryPacks >= PityPacks-1 && !slices.ContainsFunc(slots, Rarity.AtLeastRare) {
		slots[pickIndex(rng, len(slots))] = Rare
	}
	return slots
}

// DryPacksAfter is the pity counter after opening a pack with these rarities.
func DryPacksAfter(dryPacks int, got []Rarity) int {
	if slices.ContainsFunc(got, Rarity.AtLeastRare) {
		return 0
	}
	return dryPacks + 1
}

// WeightedIndex picks an index by weight; weights <= 0 are never picked.
// It returns -1 when nothing can be picked.
func WeightedIndex(rng Rand, weights []float64) int {
	total := 0.0
	for _, w := range weights {
		total += max(0, w)
	}
	if total <= 0 {
		return -1
	}
	t := rng.Float64() * total
	last := -1
	for i, w := range weights {
		if w <= 0 {
			continue
		}
		last = i
		if t -= w; t < 0 {
			return i
		}
	}
	return last
}

// FallbackRarity is the rarity to pull when `want` is sold out: the next more
// common rarity that still has cards, then the next rarer one. ok is false
// when every rarity is sold out.
func FallbackRarity(want Rarity, available func(Rarity) bool) (Rarity, bool) {
	start := want.Rank()
	for i := start; i >= 0; i-- {
		if available(Rarities[i]) {
			return Rarities[i], true
		}
	}
	for i := start + 1; i < len(Rarities); i++ {
		if available(Rarities[i]) {
			return Rarities[i], true
		}
	}
	return "", false
}

// LevelScore is a card's score at level from its level-1 score: ×2.2 per level, rounded.
func LevelScore(level1Score, level int) int {
	return int(math.Round(float64(level1Score) * math.Pow(LevelMultiplier, float64(level-1))))
}

// ClaimDay is the UTC calendar day a claim at t counts for (midnight UTC).
func ClaimDay(t time.Time) time.Time {
	y, m, d := t.UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// NextReset is the next daily reset (00:00 UTC) strictly after t.
func NextReset(t time.Time) time.Time {
	return ClaimDay(t).AddDate(0, 0, 1)
}

func pickIndex(rng Rand, n int) int {
	return min(int(rng.Float64()*float64(n)), n-1)
}
