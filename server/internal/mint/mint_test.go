package mint

import (
	"errors"
	"math/rand/v2"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	"cardgame/server/internal/game"
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

func card(id string, rarity game.Rarity, weight float64) Card {
	return Card{ID: id, Rarity: string(rarity), DropWeight: weight}
}

// limited sets a copy limit and how many copies are already out.
func limited(c Card, maxCopies, minted int32) Card {
	c.MaxCopies = pgtype.Int4{Int32: maxCopies, Valid: true}
	c.Minted = minted
	return c
}

func ids(cs []Card) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.ID
	}
	return out
}

func eq(t *testing.T, got []Card, want ...string) {
	t.Helper()
	g := ids(got)
	if len(g) != len(want) {
		t.Fatalf("got %v, want %v", g, want)
	}
	for i := range g {
		if g[i] != want[i] {
			t.Fatalf("got %v, want %v", g, want)
		}
	}
}

func TestPickByWeightWithinTheRarity(t *testing.T) {
	pool := []Card{card("c1", game.Common, 1), card("c2", game.Common, 3), card("r1", game.Rare, 1)}
	// Commons weigh 1 and 3: u < 0.25 picks c1, the rest c2. The rare is never in play.
	got, err := Pick(rolls(0.2, 0.3, 0.99), []game.Rarity{game.Common, game.Common, game.Common}, pool)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, got, "c1", "c2", "c2")
}

func TestPickMatchesWeightsOverManyPicks(t *testing.T) {
	pool := []Card{card("a", game.Common, 1), card("b", game.Common, 2), card("c", game.Common, 7)}
	slots := make([]game.Rarity, 100_000)
	for i := range slots {
		slots[i] = game.Common
	}
	got, err := Pick(rand.New(rand.NewPCG(3, 4)), slots, pool)
	if err != nil {
		t.Fatal(err)
	}
	n := map[string]int{}
	for _, c := range got {
		n[c.ID]++
	}
	for id, want := range map[string]float64{"a": 0.1, "b": 0.2, "c": 0.7} {
		if share := float64(n[id]) / float64(len(slots)); share < want-0.01 || share > want+0.01 {
			t.Errorf("%s picked %.3f of the time, want %.1f", id, share, want)
		}
	}
}

func TestPickNeverPicksZeroWeight(t *testing.T) {
	pool := []Card{card("never", game.Common, 0), card("always", game.Common, 1)}
	for _, u := range []float64{0, 0.5, 0.9999} {
		got, err := Pick(rolls(u), []game.Rarity{game.Common}, pool)
		if err != nil || got[0].ID != "always" {
			t.Fatalf("u=%v: %v %v", u, ids(got), err)
		}
	}
}

// A limited card with copies left can't be handed out more often than that,
// even within one pack.
func TestPickCountsCopiesTakenEarlierInThePack(t *testing.T) {
	pool := []Card{
		limited(card("leg", game.Legendary, 1), 25, 23), // 2 copies left
		card("epic", game.Epic, 1),
	}
	five := []game.Rarity{game.Legendary, game.Legendary, game.Legendary, game.Legendary, game.Legendary}
	got, err := Pick(rolls(0), five, pool)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, got, "leg", "leg", "epic", "epic", "epic")
}

func TestPickFallsBackToAMoreCommonRarityFirst(t *testing.T) {
	pool := []Card{
		limited(card("leg", game.Legendary, 1), 25, 25), // sold out
		card("uncommon", game.Uncommon, 1),
		card("common", game.Common, 1),
		card("rare", game.Rare, 1),
	}
	got, err := Pick(rolls(0), []game.Rarity{game.Legendary}, pool)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, got, "rare") // the next more common rarity that has cards, not the most common
}

func TestPickFallsBackToARarerRarityWhenNothingBelowIsLeft(t *testing.T) {
	got, err := Pick(rolls(0), []game.Rarity{game.Common}, []Card{card("epic", game.Epic, 1)})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, got, "epic")
}

func TestPickSoldOut(t *testing.T) {
	for name, pool := range map[string][]Card{
		"empty catalog":     nil,
		"every card capped": {limited(card("leg", game.Legendary, 1), 1, 1)},
		"only zero weights": {card("c", game.Common, 0)},
	} {
		if _, err := Pick(rolls(0), []game.Rarity{game.Common}, pool); !errors.Is(err, ErrSoldOut) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	// Runs out partway through a pack: the whole pack fails, nothing is half-picked.
	_, err := Pick(rolls(0), []game.Rarity{game.Epic, game.Epic}, []Card{limited(card("e", game.Epic, 1), 100, 99)})
	if !errors.Is(err, ErrSoldOut) {
		t.Fatalf("second slot: err = %v", err)
	}
}

func TestPickDoesNotChangeTheCatalog(t *testing.T) {
	pool := []Card{limited(card("leg", game.Legendary, 1), 25, 20)}
	if _, err := Pick(rolls(0), []game.Rarity{game.Legendary, game.Legendary}, pool); err != nil {
		t.Fatal(err)
	}
	if pool[0].Minted != 20 {
		t.Fatalf("Pick changed minted to %d; only Take may mint", pool[0].Minted)
	}
}
