package game

import (
	"bytes"
	"errors"
	"fmt"
	"math"
	"slices"
	"time"

	"gopkg.in/yaml.v3"

	"cardgame/server/rules"
)

// Rules are the tunable game rules from server/rules/game.yaml.
type Rules struct {
	Packs struct {
		DropChancePercent map[Rarity]float64 `yaml:"dropChancePercent"`
		PityPacks         int                `yaml:"pityPacks"`
	} `yaml:"packs"`
	Trading struct {
		MaxCardsPerSide    int `yaml:"maxCardsPerSide"`
		DailyOfferLimit    int `yaml:"dailyOfferLimit"`
		OfferExpiryHours   int `yaml:"offerExpiryHours"`
		NewAccountWaitDays int `yaml:"newAccountWaitDays"`
		HistoryDays        int `yaml:"historyDays"`
	} `yaml:"trading"`
	PartnerGifts struct {
		PerWeek  int      `yaml:"perWeek"`
		Rarities []Rarity `yaml:"rarities"`
	} `yaml:"partnerGifts"`
}

// maxTradeCardsLimit: the trade screens lay out at most this many cards per side.
const maxTradeCardsLimit = 5

// ParseRules reads and checks rules (unknown keys are errors, so typos don't pass silently).
func ParseRules(data []byte) (Rules, error) {
	var r Rules
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(&r); err != nil {
		return Rules{}, err
	}
	return r, r.Check()
}

// Check reports the first rule that is out of range.
func (r Rules) Check() error {
	sum := 0.0
	for rarity, pct := range r.Packs.DropChancePercent {
		if !slices.Contains(Rarities, rarity) {
			return fmt.Errorf("packs.dropChancePercent: unknown rarity %q", rarity)
		}
		if pct < 0 {
			return fmt.Errorf("packs.dropChancePercent.%s: must not be negative", rarity)
		}
		sum += pct
	}
	for _, rarity := range Rarities {
		if _, ok := r.Packs.DropChancePercent[rarity]; !ok {
			return fmt.Errorf("packs.dropChancePercent.%s: missing", rarity)
		}
	}
	if math.Abs(sum-100) > 1e-6 {
		return fmt.Errorf("packs.dropChancePercent: adds up to %g, must be 100", sum)
	}
	t := r.Trading
	switch {
	case r.Packs.PityPacks < 1:
		return errors.New("packs.pityPacks: must be at least 1")
	case t.MaxCardsPerSide < 1 || t.MaxCardsPerSide > maxTradeCardsLimit:
		return fmt.Errorf("trading.maxCardsPerSide: must be 1-%d", maxTradeCardsLimit)
	case t.DailyOfferLimit < 1:
		return errors.New("trading.dailyOfferLimit: must be at least 1")
	case t.OfferExpiryHours < 1:
		return errors.New("trading.offerExpiryHours: must be at least 1")
	case t.NewAccountWaitDays < 0:
		return errors.New("trading.newAccountWaitDays: must not be negative")
	case t.HistoryDays < 1:
		return errors.New("trading.historyDays: must be at least 1")
	case r.PartnerGifts.PerWeek < 0 || r.PartnerGifts.PerWeek > math.MaxInt16:
		return errors.New("partnerGifts.perWeek: must be 0 or more")
	}
	total := 0.0
	for i, rarity := range r.PartnerGifts.Rarities {
		if !slices.Contains(Rarities, rarity) {
			return fmt.Errorf("partnerGifts.rarities: unknown rarity %q", rarity)
		}
		if slices.Contains(r.PartnerGifts.Rarities[:i], rarity) {
			return fmt.Errorf("partnerGifts.rarities: %s listed twice", rarity)
		}
		total += r.Packs.DropChancePercent[rarity]
	}
	if r.PartnerGifts.PerWeek > 0 && total <= 0 {
		return errors.New("partnerGifts.rarities: needs at least one rarity with a drop chance above 0")
	}
	return nil
}

// UseRules makes r the rules the game plays by (the package-level values below).
// Called with game.yaml at startup; tests can call it to try other values.
func UseRules(r Rules) {
	current = r
	DropChance = r.Packs.DropChancePercent
	PityPacks = r.Packs.PityPacks
	MaxTradeCards = r.Trading.MaxCardsPerSide
	DailyTradeLimit = r.Trading.DailyOfferLimit
	TradeExpiry = time.Duration(r.Trading.OfferExpiryHours) * time.Hour
	NewAccountWait = time.Duration(r.Trading.NewAccountWaitDays) * 24 * time.Hour
	TradeHistory = time.Duration(r.Trading.HistoryDays) * 24 * time.Hour
	PartnerGiftsPerWeek = r.PartnerGifts.PerWeek
	GiftRarities = r.PartnerGifts.Rarities
}

// CurrentRules are the rules in use.
func CurrentRules() Rules { return current }

var current Rules

func init() {
	r, err := ParseRules(rules.GameYAML)
	if err != nil {
		panic("server/rules/game.yaml: " + err.Error())
	}
	UseRules(r)
}
