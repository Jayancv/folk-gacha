package game

import (
	"slices"
)

// PowerCards is how many of a player's best cards make up their collection power.
const PowerCards = 10

// MaxShowcase is how many cards a profile can show.
const MaxShowcase = 5

// CollectionPower is the sum of the best PowerCards scores (each already at its level).
// Shown on profiles, never ranked.
func CollectionPower(scores []int) int {
	best := slices.Clone(scores)
	slices.SortFunc(best, func(a, b int) int { return b - a })
	total := 0
	for _, s := range best[:min(len(best), PowerCards)] {
		total += s
	}
	return total
}
