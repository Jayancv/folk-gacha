package game

import (
	"strings"
	"testing"

	"cardgame/server/rules"
)

func TestGameYAMLIsInUse(t *testing.T) {
	r, err := ParseRules(rules.GameYAML)
	if err != nil {
		t.Fatal(err)
	}
	if MaxTradeCards != r.Trading.MaxCardsPerSide || DailyTradeLimit != r.Trading.DailyOfferLimit ||
		PityPacks != r.Packs.PityPacks || DropChance[Legendary] != r.Packs.DropChancePercent[Legendary] {
		t.Error("the package values don't match game.yaml")
	}
}

func TestRulesOutOfRangeAreRefused(t *testing.T) {
	good := string(rules.GameYAML)
	for _, c := range []struct{ name, from, to, want string }{
		{"odds not 100", "legendary: 0.2", "legendary: 5", "adds up to"},
		{"rarity missing", "    legendary: 0.2\n", "", "legendary: missing"},
		{"unknown rarity", "legendary: 0.2", "legendary: 0.2\n    mythic: 0", `unknown rarity "mythic"`},
		{"too many cards per side", "maxCardsPerSide: 5", "maxCardsPerSide: 6", "maxCardsPerSide"},
		{"no offers", "dailyOfferLimit: 5", "dailyOfferLimit: 0", "dailyOfferLimit"},
		{"negative wait", "newAccountWaitDays: 0", "newAccountWaitDays: -1", "newAccountWaitDays"},
		{"gift rarity twice", "[common, uncommon]", "[common, common]", "listed twice"},
		{"typo in a key", "pityPacks: 7", "pittyPacks: 7", "pittyPacks"},
	} {
		changed := strings.Replace(good, c.from, c.to, 1)
		if changed == good {
			t.Fatalf("%s: %q not in game.yaml", c.name, c.from)
		}
		if _, err := ParseRules([]byte(changed)); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want it to mention %q", c.name, err, c.want)
		}
	}
}
