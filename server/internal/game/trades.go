package game

import (
	"errors"
	"fmt"
	"time"
)

// Trading rules, from server/rules/game.yaml (see rules.go).
var (
	// MaxTradeCards is the most cards on each side of an offer.
	MaxTradeCards int
	// DailyTradeLimit is how many offers a player can send per UTC day.
	DailyTradeLimit int
	// TradeExpiry is how long an offer stays open.
	TradeExpiry time.Duration
	// NewAccountWait is how long after sign-up an account can start trading.
	NewAccountWait time.Duration
	// TradeHistory is how long finished offers keep showing in a player's list.
	TradeHistory time.Duration
	// PartnerGiftsPerWeek is how many partner gifts a player can get per weekly season:
	// the first accepted trade between two players gives each of them one, so a main
	// account can't farm a stream of alt accounts. 0 turns gifts off.
	PartnerGiftsPerWeek int
	// GiftRarities are what a partner gift can be.
	GiftRarities []Rarity
)

// ErrBadOffer wraps every reason an offer's card lists are invalid.
var ErrBadOffer = errors.New("bad offer")

// CheckOffer validates the card lists of a new offer: 1 to MaxTradeCards cards on
// each side (no one-way gifts), and no card listed twice.
func CheckOffer[ID comparable](offer, request []ID) error {
	for _, side := range []struct {
		name  string
		cards []ID
	}{{"offer", offer}, {"request", request}} {
		if n := len(side.cards); n < 1 || n > MaxTradeCards {
			return fmt.Errorf("%w: %s 1-%d cards (got %d)", ErrBadOffer, side.name, MaxTradeCards, n)
		}
	}
	seen := make(map[ID]bool, len(offer)+len(request))
	for _, id := range append(append([]ID(nil), offer...), request...) {
		if seen[id] {
			return fmt.Errorf("%w: a card is listed twice", ErrBadOffer)
		}
		seen[id] = true
	}
	return nil
}

// TradeUnlocksAt is when an account created at `created` can start trading.
func TradeUnlocksAt(created time.Time) time.Time {
	return created.Add(NewAccountWait)
}

// CanTrade reports whether an account created at `created` may trade at `now`.
func CanTrade(created, now time.Time) bool {
	return !now.Before(TradeUnlocksAt(created))
}

// TradeExpiresAt is when an offer made at `created` expires.
func TradeExpiresAt(created time.Time) time.Time {
	return created.Add(TradeExpiry)
}

// TradeDay is the UTC day an offer counts toward for the daily limit (same boundary as packs).
func TradeDay(t time.Time) time.Time {
	return ClaimDay(t)
}

// MergedTraded: a card merged from a traded card counts as traded too, so a traded
// card can't be turned into season points by merging it.
func MergedTraded(a, b bool) bool {
	return a || b
}

// GiftRarity rolls a partner gift's rarity among GiftRarities, in their pack odds.
func GiftRarity(rng Rand) Rarity {
	total := 0.0
	for _, r := range GiftRarities {
		total += DropChance[r]
	}
	t := rng.Float64() * total
	for _, r := range GiftRarities {
		if t -= DropChance[r]; t < 0 {
			return r
		}
	}
	return GiftRarities[len(GiftRarities)-1] // float rounding at t ≈ total
}

// GiftWeek is the weekly season a gift given at t counts toward for PartnerGiftsPerWeek.
func GiftWeek(t time.Time) string {
	return SeasonFor(t).ID
}
