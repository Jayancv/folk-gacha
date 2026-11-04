package game

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"cardgame/server/rules"
)

func TestTournamentsYAMLIsInUse(t *testing.T) {
	r, err := ParseTournamentRules(rules.TournamentsYAML)
	if err != nil {
		t.Fatal(err)
	}
	if len(TournamentSeries) != len(r.Series) || len(TournamentFormats) != len(r.Formats) {
		t.Error("the package values don't match tournaments.yaml")
	}
	for id, f := range TournamentFormats {
		if f.ID != id {
			t.Errorf("format %q has ID %q", id, f.ID)
		}
	}
}

func TestTournamentRulesOutOfRangeAreRefused(t *testing.T) {
	good := string(rules.TournamentsYAML)
	for _, c := range []struct{ name, from, to, want string }{
		{"unknown cadence", "cadence: daily", "cadence: hourly", "cadence"},
		{"entries as long as the day", "entryHours: 20", "entryHours: 24", "entryHours"},
		{"no entry time", "entryHours: 120", "entryHours: 0", "entryHours"},
		{"unknown format in a series", "formats: [harmony, power, underdog]", "formats: [harmony, poker]", `unknown format "poker"`},
		{"no formats", "formats: [harmony, power, underdog]", "formats: []", "at least one"},
		{"series id twice", "id: weekly", "id: daily", "used twice"},
		{"too few slots", "slots: 3\n    maxRarity", "slots: 2\n    maxRarity", "slots"},
		{"too many slots", "kind: power\n    name: Power\n    slots: 5", "kind: power\n    name: Power\n    slots: 6", "slots"},
		{"unknown kind", "kind: power", "kind: poker", "not a format kind"},
		{"multiplier that lowers", "elementMultiplier: 2", "elementMultiplier: 0.5", "elementMultiplier"},
		{"setting on the wrong kind", "kind: power\n    name: Power", "kind: power\n    name: Power\n    elementMultiplier: 2", "only for element-trial"},
		{"cap at legendary", "maxRarity: uncommon", "maxRarity: legendary", "maxRarity"},
		{"allow every slot above the cap", "allowAbove: 0", "allowAbove: 3", "allowAbove"},
		{"rarity base missing", "legendary: 400 }", "}", "rarityBase.legendary"},
		{"rarity base zero", "common: 10,", "common: 0,", "rarityBase.common"},
		{"no harmony bonus", "harmonyBonusPercent: 10", "harmonyBonusPercent: 0", "harmonyBonusPercent"},
		{"typo in a key", "entryHours: 20", "entryHour: 20", "entryHour"},
		{"prize of no cards", "prizeCards: [3, 2, 1]", "prizeCards: [3, 0]", "prizeCards[1]"},
		{"prize of too many cards", "prizeCards: [3, 2, 1]", "prizeCards: [6]", "prizeCards[0]"},
		{"lower place wins more", "prizeCards: [3, 2, 1]", "prizeCards: [1, 2]", "lower place"},
		{"too many prize places", "prizeCards: [3, 2, 1]", "prizeCards: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]", "places"},
	} {
		changed := strings.Replace(good, c.from, c.to, 1)
		if changed == good {
			t.Fatalf("%s: %q not in tournaments.yaml", c.name, c.from)
		}
		if _, err := ParseTournamentRules([]byte(changed)); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want it to mention %q", c.name, err, c.want)
		}
	}
}

// useTestTournaments swaps in small rules for one test.
func useTestTournaments(t *testing.T, yaml string) {
	t.Helper()
	r, err := ParseTournamentRules([]byte(yaml))
	if err != nil {
		t.Fatal(err)
	}
	old := CurrentTournamentRules()
	UseTournamentRules(r)
	t.Cleanup(func() { UseTournamentRules(old) })
}

const testTournaments = `
series:
  - { id: daily, name: Daily, cadence: daily, entryHours: 20, formats: [power, trial] }
  - { id: weekly, name: Weekly, cadence: weekly, entryHours: 120, formats: [power] }
formats:
  power: { kind: power, name: Power, slots: 3 }
  trial: { kind: element-trial, name: Trial, slots: 3, elementMultiplier: 2 }
`

func TestDailyTournamentPeriods(t *testing.T) {
	useTestTournaments(t, testTournaments)
	daily := TournamentSeries[0]
	at := time.Date(2026, 11, 3, 23, 59, 59, 0, time.UTC)
	tour := daily.TournamentAt(at)
	if tour.ID != "daily-2026-11-03" {
		t.Errorf("ID = %s", tour.ID)
	}
	if want := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC); !tour.OpensAt.Equal(want) {
		t.Errorf("OpensAt = %v, want %v", tour.OpensAt, want)
	}
	if want := time.Date(2026, 11, 3, 20, 0, 0, 0, time.UTC); !tour.ClosesAt.Equal(want) {
		t.Errorf("ClosesAt = %v, want %v", tour.ClosesAt, want)
	}
	if want := time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC); !tour.EndsAt.Equal(want) {
		t.Errorf("EndsAt = %v, want %v", tour.EndsAt, want)
	}
	// Midnight belongs to the next day's tournament.
	next := daily.TournamentAt(tour.EndsAt)
	if next.ID != "daily-2026-11-04" || next.ID != daily.Next(tour).ID || daily.Previous(next).ID != tour.ID {
		t.Errorf("next = %s; Next/Previous disagree", next.ID)
	}
	// A time in another zone counts by its UTC day.
	colombo := time.FixedZone("Colombo", 5*3600+1800)
	if got := daily.TournamentAt(time.Date(2026, 11, 4, 3, 0, 0, 0, colombo)).ID; got != "daily-2026-11-03" {
		t.Errorf("04 Nov 03:00 in Colombo = %s, want the 3 Nov tournament", got)
	}
}

func TestWeeklyTournamentPeriods(t *testing.T) {
	useTestTournaments(t, testTournaments)
	weekly := TournamentSeries[1]
	// 2026-11-08 is a Sunday: still the week that began Monday 2 November.
	tour := weekly.TournamentAt(time.Date(2026, 11, 8, 23, 0, 0, 0, time.UTC))
	if tour.ID != "weekly-2026-W45" {
		t.Errorf("ID = %s", tour.ID)
	}
	if want := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC); !tour.OpensAt.Equal(want) || !tour.EndsAt.Equal(want.AddDate(0, 0, 7)) {
		t.Errorf("runs %v – %v", tour.OpensAt, tour.EndsAt)
	}
	if want := time.Date(2026, 11, 7, 0, 0, 0, 0, time.UTC); !tour.ClosesAt.Equal(want) {
		t.Errorf("ClosesAt = %v, want %v (120 hours in)", tour.ClosesAt, want)
	}
	// The week matches the leaderboard's ISO week, across the year end too (2026 has 53).
	for _, at := range []time.Time{
		time.Date(2026, 12, 31, 12, 0, 0, 0, time.UTC),
		time.Date(2027, 1, 4, 0, 0, 0, 0, time.UTC),
	} {
		if got, want := weekly.TournamentAt(at).ID, "weekly-"+SeasonFor(at).ID; got != want {
			t.Errorf("%v: %s, want %s", at, got, want)
		}
	}
}

func TestPrizes(t *testing.T) {
	tour := Series{ID: "s", Cadence: CadenceDaily, Formats: []string{"power"}, PrizeCards: []int{3, 2, 1}}.
		TournamentAt(time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC))
	for rank, want := range map[int]int{0: 0, 1: 3, 2: 2, 3: 1, 4: 0} {
		if got := tour.PrizeFor(rank); got != want {
			t.Errorf("PrizeFor(%d) = %d, want %d", rank, got, want)
		}
	}
	for _, s := range TournamentSeries {
		if s.PrizeCards == nil {
			t.Errorf("series %s in tournaments.yaml has no prizeCards", s.ID)
		}
	}
}

func TestTournamentStatus(t *testing.T) {
	useTestTournaments(t, testTournaments)
	tour := TournamentSeries[0].TournamentAt(time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC))
	for _, c := range []struct {
		at   time.Time
		want string
	}{
		{tour.OpensAt.Add(-time.Second), TournamentUpcoming},
		{tour.OpensAt, TournamentOpen},
		{tour.ClosesAt.Add(-time.Second), TournamentOpen},
		{tour.ClosesAt, TournamentLocked},
		{tour.EndsAt.Add(-time.Second), TournamentLocked},
		{tour.EndsAt, TournamentFinished},
	} {
		if got := tour.Status(c.at); got != c.want {
			t.Errorf("at %v: %s, want %s", c.at, got, c.want)
		}
	}
}

func TestFormatsRotateAndElementTrialsChangeElement(t *testing.T) {
	useTestTournaments(t, testTournaments)
	daily := TournamentSeries[0]
	tour := daily.TournamentAt(time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC))
	var trials []string
	for range 20 {
		next := daily.Next(tour)
		if next.Format.ID == tour.Format.ID {
			t.Fatalf("%s and %s both %s: formats should alternate", tour.ID, next.ID, tour.Format.ID)
		}
		if tour.Format.Kind == FormatElementTrial {
			if tour.Element == "" {
				t.Fatalf("%s: element trial without an element", tour.ID)
			}
			trials = append(trials, tour.Element)
		} else if tour.Element != "" {
			t.Errorf("%s: %s has element %s", tour.ID, tour.Format.ID, tour.Element)
		}
		tour = next
	}
	// Ten trials in a row walk through every element twice, never repeating back to back.
	for i := 1; i < len(trials); i++ {
		if trials[i] == trials[i-1] {
			t.Fatalf("element trials repeat %s: %v", trials[i], trials)
		}
	}
	for _, e := range Elements {
		if !strings.Contains(strings.Join(trials, ","), e) {
			t.Errorf("element %s never came up: %v", e, trials)
		}
	}
}

func card(id, spirit, element string, rarity Rarity, score int) LineupCard {
	return LineupCard{ID: id, Spirit: spirit, Element: element, Rarity: rarity, Level: 1, Score: score}
}

func TestCheckLineup(t *testing.T) {
	opens := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	tourWith := func(f Format) Tournament { return Tournament{Format: f, OpensAt: opens} }
	power := Format{Kind: FormatPower, Slots: 3}
	capped := Format{Kind: FormatRarityCap, Slots: 3, MaxRarity: Uncommon, AllowAbove: 1}
	harmony := Format{Kind: FormatHarmony, Slots: 3, HarmonyBonusPercent: 10, OnePerSpirit: true}
	a := card("a", "gaja-calf", "earth", Common, 10)
	b := card("b", "malu", "water", Uncommon, 25)
	c := card("c", "simha", "fire", Rare, 60)
	d := card("d", "makara", "water", Legendary, 400)
	twin := card("e", "gaja-calf", "earth", Common, 22)
	tradedEarly := card("f", "hansa", "wind", Common, 10)
	tradedEarly.Traded, tradedEarly.AcquiredAt = true, opens.Add(-time.Minute)
	tradedLate := tradedEarly
	tradedLate.ID, tradedLate.AcquiredAt = "g", opens.Add(time.Minute)
	pulledLate := card("h", "ura", "forest", Common, 10)
	pulledLate.AcquiredAt = opens.Add(time.Hour)

	for _, x := range []struct {
		name   string
		format Format
		cards  []LineupCard
		want   error
	}{
		{"full lineup", power, []LineupCard{a, b, c}, nil},
		{"fewer cards than slots", power, []LineupCard{a, b}, nil},
		{"one card", power, []LineupCard{a}, nil},
		{"no cards", power, nil, ErrLineupSize},
		{"too many", power, []LineupCard{a, b, c, d}, ErrLineupSize},
		{"same card twice", power, []LineupCard{a, b, a}, ErrLineupDuplicate},
		{"one above the cap allowed", capped, []LineupCard{a, b, c}, nil},
		{"two above the cap", capped, []LineupCard{a, c, d}, ErrLineupRarity},
		{"two of a spirit where one per spirit", harmony, []LineupCard{a, twin, b}, ErrLineupSpirit},
		{"two of a spirit elsewhere", power, []LineupCard{a, twin, b}, nil},
		{"traded before it opened", power, []LineupCard{a, b, tradedEarly}, nil},
		{"traded after it opened", power, []LineupCard{a, b, tradedLate}, ErrLineupTradedLate},
		{"pulled after it opened", power, []LineupCard{a, b, pulledLate}, nil},
	} {
		err := tourWith(x.format).CheckLineup(x.cards)
		if !errors.Is(err, x.want) {
			t.Errorf("%s: err = %v, want %v", x.name, err, x.want)
		}
	}
}

func TestScoreFormats(t *testing.T) {
	base := map[Rarity]float64{Common: 10, Uncommon: 25, Rare: 60, Epic: 150, Legendary: 400}
	// A level-3 Common (10 × 2.2² ≈ 48), a fresh Rare and a fresh Epic.
	common := card("a", "gaja-calf", "earth", Common, LevelScore(10, 3))
	rare := card("b", "kinduru", "wind", Rare, 60)
	epic := card("c", "naga-raksha", "water", Epic, 150)
	water := card("d", "malu", "water", Common, 12)
	lineup := []LineupCard{common, rare, epic}

	for _, x := range []struct {
		name   string
		tour   Tournament
		cards  []LineupCard
		points []int
		bonus  int
		total  int
	}{
		{"power counts scores", Tournament{Format: Format{Kind: FormatPower}}, lineup, []int{48, 60, 150}, 0, 258},
		{"rarity cap scores like power", Tournament{Format: Format{Kind: FormatRarityCap, MaxRarity: Epic}}, lineup, []int{48, 60, 150}, 0, 258},
		{"element trial doubles its element",
			Tournament{Format: Format{Kind: FormatElementTrial, ElementMultiplier: 2}, Element: "water"},
			[]LineupCard{common, epic, water}, []int{48, 300, 24}, 0, 372},
		{"underdog: a levelled Common beats a fresh Rare",
			Tournament{Format: Format{Kind: FormatUnderdog, RarityBase: base}}, lineup, []int{48, 10, 10}, 0, 68},
		{"harmony: +10% per extra element",
			Tournament{Format: Format{Kind: FormatHarmony, HarmonyBonusPercent: 10}}, lineup, []int{48, 60, 150}, 52, 310},
		{"harmony: one element, no bonus",
			Tournament{Format: Format{Kind: FormatHarmony, HarmonyBonusPercent: 10}}, []LineupCard{epic, water}, []int{150, 12}, 0, 162},
	} {
		s := x.tour.Score(x.cards)
		var got []int
		for i, c := range s.Cards {
			if c.CardID != x.cards[i].ID {
				t.Errorf("%s: breakdown %d is card %s, want %s", x.name, i, c.CardID, x.cards[i].ID)
			}
			got = append(got, c.Points)
		}
		if fmt.Sprint(got) != fmt.Sprint(x.points) || s.Bonus != x.bonus || s.Total != x.total {
			t.Errorf("%s: points %v bonus %d total %d, want %v %d %d", x.name, got, s.Bonus, s.Total, x.points, x.bonus, x.total)
		}
	}
}

func TestBreakdownShowsMultipliers(t *testing.T) {
	tour := Tournament{Format: Format{Kind: FormatElementTrial, ElementMultiplier: 2}, Element: "fire"}
	s := tour.Score([]LineupCard{card("a", "simha", "fire", Uncommon, 25), card("b", "malu", "water", Common, 10)})
	if s.Cards[0].Multiplier != 2 || s.Cards[1].Multiplier != 1 {
		t.Errorf("multipliers %v, %v", s.Cards[0].Multiplier, s.Cards[1].Multiplier)
	}
	h := Tournament{Format: Format{Kind: FormatHarmony, HarmonyBonusPercent: 10}}.Score(
		[]LineupCard{card("a", "simha", "fire", Uncommon, 25), card("b", "malu", "water", Common, 10), card("c", "ura", "forest", Uncommon, 25)})
	if h.BonusPercent != 20 {
		t.Errorf("three elements: bonus %d%%, want 20%%", h.BonusPercent)
	}
}

func TestRankEntries(t *testing.T) {
	seed := []byte("committed seed")
	entries := []EntryTotal{{"amal", 100}, {"bina", 300}, {"chen", 100}, {"devi", 200}, {"eshan", 100}}
	ranked := RankEntries(entries, seed)
	if ranked[0].UserID != "bina" || ranked[1].UserID != "devi" {
		t.Errorf("top two %s, %s", ranked[0].UserID, ranked[1].UserID)
	}
	for i, r := range ranked {
		if r.Rank != i+1 {
			t.Errorf("rank %d at %d", r.Rank, i)
		}
	}
	// Ties come out the same whatever order the entries arrive in…
	reversed := []EntryTotal{entries[4], entries[3], entries[2], entries[1], entries[0]}
	if fmt.Sprint(RankEntries(reversed, seed)) != fmt.Sprint(ranked) {
		t.Error("tie order depends on entry order")
	}
	// …and another seed can order them differently (the seed, not the names, decides).
	differs := false
	for i := range 20 {
		other := RankEntries(entries, fmt.Appendf(nil, "seed %d", i))
		if fmt.Sprint(other[2:]) != fmt.Sprint(ranked[2:]) {
			differs = true
			break
		}
	}
	if !differs {
		t.Error("ties never change with the seed")
	}
	if len(RankEntries(nil, seed)) != 0 {
		t.Error("no entries, no ranks")
	}
}

func TestSeedHash(t *testing.T) {
	// SHA-256 of "abc".
	if got := SeedHash([]byte("abc")); got != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Errorf("SeedHash = %s", got)
	}
}
