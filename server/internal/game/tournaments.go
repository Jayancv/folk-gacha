package game

import (
	"bytes"
	"cmp"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"slices"
	"time"

	"gopkg.in/yaml.v3"

	"cardgame/server/rules"
)

// Elements of the cards, in the order element trials rotate through them.
var Elements = []string{"earth", "fire", "water", "wind", "forest"}

// Tournament format kinds: how a lineup is scored.
const (
	FormatPower        = "power"
	FormatElementTrial = "element-trial"
	FormatRarityCap    = "rarity-cap"
	FormatUnderdog     = "underdog"
	FormatHarmony      = "harmony"
)

var formatKinds = []string{FormatPower, FormatElementTrial, FormatRarityCap, FormatUnderdog, FormatHarmony}

// Tournament cadences: one tournament per UTC day, or per ISO week (Monday 00:00 UTC).
const (
	CadenceDaily  = "daily"
	CadenceWeekly = "weekly"
)

// Lineup sizes the screens can lay out.
const (
	MinLineupSlots = 3
	MaxLineupSlots = 5
)

// Format is one way of scoring lineups (server/rules/tournaments.yaml).
type Format struct {
	// ID is the key in the file; set when parsed.
	ID                  string             `yaml:"-"`
	Kind                string             `yaml:"kind"`
	Name                string             `yaml:"name"`
	Slots               int                `yaml:"slots"`
	OnePerSpirit        bool               `yaml:"onePerSpirit"`
	ElementMultiplier   float64            `yaml:"elementMultiplier"`
	MaxRarity           Rarity             `yaml:"maxRarity"`
	AllowAbove          int                `yaml:"allowAbove"`
	RarityBase          map[Rarity]float64 `yaml:"rarityBase"`
	HarmonyBonusPercent int                `yaml:"harmonyBonusPercent"`
}

// Series runs one tournament per period, back to back, rotating through its formats.
type Series struct {
	ID         string   `yaml:"id"`
	Name       string   `yaml:"name"`
	Cadence    string   `yaml:"cadence"`
	EntryHours int      `yaml:"entryHours"`
	Formats    []string `yaml:"formats"`
}

// TournamentRules is server/rules/tournaments.yaml.
type TournamentRules struct {
	Series  []Series          `yaml:"series"`
	Formats map[string]Format `yaml:"formats"`
}

// ParseTournamentRules reads and checks the tournament rules (unknown keys are errors).
func ParseTournamentRules(data []byte) (TournamentRules, error) {
	var r TournamentRules
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(&r); err != nil {
		return TournamentRules{}, err
	}
	for id, f := range r.Formats {
		f.ID = id
		r.Formats[id] = f
	}
	return r, r.Check()
}

// Check reports the first value that is out of range.
func (r TournamentRules) Check() error {
	for id, f := range r.Formats {
		if err := f.check(); err != nil {
			return fmt.Errorf("formats.%s.%w", id, err)
		}
	}
	seen := map[string]bool{}
	for i, s := range r.Series {
		at := fmt.Sprintf("series[%d]", i)
		if s.ID == "" {
			return fmt.Errorf("%s.id: missing", at)
		}
		if seen[s.ID] {
			return fmt.Errorf("%s.id: %q used twice", at, s.ID)
		}
		seen[s.ID] = true
		if s.Name == "" {
			return fmt.Errorf("%s.name: missing", at)
		}
		hours := 0
		switch s.Cadence {
		case CadenceDaily:
			hours = 24
		case CadenceWeekly:
			hours = 7 * 24
		default:
			return fmt.Errorf("%s.cadence: %q, must be daily or weekly", at, s.Cadence)
		}
		if s.EntryHours < 1 || s.EntryHours >= hours {
			return fmt.Errorf("%s.entryHours: must be 1-%d for a %s series", at, hours-1, s.Cadence)
		}
		if len(s.Formats) == 0 {
			return fmt.Errorf("%s.formats: needs at least one", at)
		}
		for _, f := range s.Formats {
			if _, ok := r.Formats[f]; !ok {
				return fmt.Errorf("%s.formats: unknown format %q", at, f)
			}
		}
	}
	return nil
}

func (f Format) check() error {
	if !slices.Contains(formatKinds, f.Kind) {
		return fmt.Errorf("kind: %q is not a format kind", f.Kind)
	}
	if f.Name == "" {
		return errors.New("name: missing")
	}
	if f.Slots < MinLineupSlots || f.Slots > MaxLineupSlots {
		return fmt.Errorf("slots: must be %d-%d", MinLineupSlots, MaxLineupSlots)
	}
	// Each kind's own settings are required, and refused on the other kinds (likely a mistake).
	only := func(field string, set bool, kind string) error {
		if set && f.Kind != kind {
			return fmt.Errorf("%s: only for %s formats", field, kind)
		}
		return nil
	}
	if err := cmp.Or(
		only("elementMultiplier", f.ElementMultiplier != 0, FormatElementTrial),
		only("maxRarity", f.MaxRarity != "", FormatRarityCap),
		only("allowAbove", f.AllowAbove != 0, FormatRarityCap),
		only("rarityBase", f.RarityBase != nil, FormatUnderdog),
		only("harmonyBonusPercent", f.HarmonyBonusPercent != 0, FormatHarmony),
	); err != nil {
		return err
	}
	switch f.Kind {
	case FormatElementTrial:
		if f.ElementMultiplier <= 1 || f.ElementMultiplier > 10 {
			return errors.New("elementMultiplier: must be above 1, at most 10")
		}
	case FormatRarityCap:
		if f.MaxRarity.Rank() < 0 || f.MaxRarity == Legendary {
			return errors.New("maxRarity: must be common, uncommon, rare or epic")
		}
		if f.AllowAbove < 0 || f.AllowAbove >= f.Slots {
			return errors.New("allowAbove: must be 0 or more, fewer than slots")
		}
	case FormatUnderdog:
		for _, r := range Rarities {
			if f.RarityBase[r] <= 0 {
				return fmt.Errorf("rarityBase.%s: must be above 0", r)
			}
		}
		if len(f.RarityBase) != len(Rarities) {
			return errors.New("rarityBase: unknown rarity")
		}
	case FormatHarmony:
		if f.HarmonyBonusPercent < 1 || f.HarmonyBonusPercent > 100 {
			return errors.New("harmonyBonusPercent: must be 1-100")
		}
	}
	return nil
}

// TournamentSeries are the series from tournaments.yaml (set at startup, see UseTournamentRules).
var TournamentSeries []Series

// TournamentFormats are the formats from tournaments.yaml, by id.
var TournamentFormats map[string]Format

// UseTournamentRules makes r the tournament rules in use. Tests can call it to try other values.
func UseTournamentRules(r TournamentRules) {
	currentTournaments = r
	TournamentSeries = r.Series
	TournamentFormats = r.Formats
}

// CurrentTournamentRules are the tournament rules in use.
func CurrentTournamentRules() TournamentRules { return currentTournaments }

var currentTournaments TournamentRules

func init() {
	r, err := ParseTournamentRules(rules.TournamentsYAML)
	if err != nil {
		panic("server/rules/tournaments.yaml: " + err.Error())
	}
	UseTournamentRules(r)
}

// Tournament is one tournament of a series: when it runs and how it scores.
type Tournament struct {
	// ID is the series id plus its period: "daily-2026-11-03", "weekly-2026-W45".
	ID     string
	Series string
	// N numbers the series' periods (days or weeks since 1970); the format rotates by it.
	N      int
	Format Format
	// Element is the trial's element (element-trial formats only).
	Element string
	// OpensAt: entries open. ClosesAt: lineups are final and scored. EndsAt: cards are free again.
	OpensAt  time.Time
	ClosesAt time.Time
	EndsAt   time.Time
}

// Tournament statuses.
const (
	TournamentUpcoming = "upcoming"
	TournamentOpen     = "open"
	TournamentLocked   = "locked"
	TournamentFinished = "finished"
)

// mondayEpoch is the first Monday after the Unix epoch: weekly periods count from it.
var mondayEpoch = time.Date(1970, 1, 5, 0, 0, 0, 0, time.UTC)

// TournamentAt is the series' tournament whose period contains t.
func (s Series) TournamentAt(t time.Time) Tournament {
	day := ClaimDay(t)
	if s.Cadence == CadenceWeekly {
		n := int(math.Floor(day.Sub(mondayEpoch).Hours() / (7 * 24)))
		return s.tournament(n)
	}
	return s.tournament(int(day.Unix() / 86400))
}

// Next is the tournament after t's, and Previous the one before.
func (s Series) Next(t Tournament) Tournament     { return s.tournament(t.N + 1) }
func (s Series) Previous(t Tournament) Tournament { return s.tournament(t.N - 1) }

func (s Series) tournament(n int) Tournament {
	var opens, ends time.Time
	var period string
	if s.Cadence == CadenceWeekly {
		opens = mondayEpoch.AddDate(0, 0, 7*n)
		ends = opens.AddDate(0, 0, 7)
		period = SeasonFor(opens).ID
	} else {
		opens = time.Unix(int64(n)*86400, 0).UTC()
		ends = opens.AddDate(0, 0, 1)
		period = opens.Format(time.DateOnly)
	}
	turn := n % len(s.Formats)
	t := Tournament{
		ID:       s.ID + "-" + period,
		Series:   s.ID,
		N:        n,
		Format:   TournamentFormats[s.Formats[turn]],
		OpensAt:  opens,
		ClosesAt: opens.Add(time.Duration(s.EntryHours) * time.Hour),
		EndsAt:   ends,
	}
	if t.Format.Kind == FormatElementTrial {
		// Rotate the element each time the format comes round (not by n itself: with five
		// formats and five elements that would pick the same element every time).
		t.Element = Elements[(n/len(s.Formats))%len(Elements)]
	}
	return t
}

// Status of the tournament at now.
func (t Tournament) Status(now time.Time) string {
	switch {
	case now.Before(t.OpensAt):
		return TournamentUpcoming
	case now.Before(t.ClosesAt):
		return TournamentOpen
	case now.Before(t.EndsAt):
		return TournamentLocked
	default:
		return TournamentFinished
	}
}

// LineupCard is a card as a tournament sees it (snapshotted when entries close).
type LineupCard struct {
	ID      string
	Spirit  string
	Element string
	Rarity  Rarity
	Level   int
	// Score at the card's level.
	Score int
	// Traded: came from (or was merged from) a trade or gift; AcquiredAt: when the player got it.
	Traded     bool
	AcquiredAt time.Time
}

// Lineup errors.
var (
	ErrLineupSize      = errors.New("game: lineup has the wrong number of cards")
	ErrLineupDuplicate = errors.New("game: lineup lists a card twice")
	ErrLineupRarity    = errors.New("game: lineup breaks the format's rarity cap")
	ErrLineupSpirit    = errors.New("game: lineup has two cards of one spirit")
	// ErrLineupTradedLate: traded cards count only if they were traded before the
	// tournament opened, so an alt can't lend a main its best cards for one event.
	ErrLineupTradedLate = errors.New("game: lineup has a card traded after the tournament opened")
)

// CheckLineup reports whether cards are a valid lineup for t. Ownership, locks and the
// "not in the series' previous tournament" rule need the database; the server checks those.
func (t Tournament) CheckLineup(cards []LineupCard) error {
	f := t.Format
	if len(cards) != f.Slots {
		return fmt.Errorf("%w: %d, want %d", ErrLineupSize, len(cards), f.Slots)
	}
	ids := map[string]bool{}
	spirits := map[string]bool{}
	above := 0
	for _, c := range cards {
		if ids[c.ID] {
			return ErrLineupDuplicate
		}
		ids[c.ID] = true
		if f.OnePerSpirit && spirits[c.Spirit] {
			return ErrLineupSpirit
		}
		spirits[c.Spirit] = true
		if c.Traded && c.AcquiredAt.After(t.OpensAt) {
			return ErrLineupTradedLate
		}
		if f.Kind == FormatRarityCap && c.Rarity.Rank() > f.MaxRarity.Rank() {
			above++
		}
	}
	if above > f.AllowAbove {
		return fmt.Errorf("%w: %d cards above %s, at most %d", ErrLineupRarity, above, f.MaxRarity, f.AllowAbove)
	}
	return nil
}

// CardPoints is one card's line in a score breakdown.
type CardPoints struct {
	CardID string
	// Multiplier applied to the card's score (1 when the format leaves it as it is).
	Multiplier float64
	Points     int
}

// LineupScore is a lineup's total with its breakdown, so players see why they placed.
type LineupScore struct {
	Cards []CardPoints
	// BonusPercent and Bonus: the lineup bonus (Harmony), added after the cards.
	BonusPercent int
	Bonus        int
	Total        int
}

// Score scores a lineup (assumed valid, see CheckLineup) by t's format.
func (t Tournament) Score(cards []LineupCard) LineupScore {
	f := t.Format
	s := LineupScore{Cards: make([]CardPoints, 0, len(cards))}
	sum := 0
	elements := map[string]bool{}
	for _, c := range cards {
		m := 1.0
		switch f.Kind {
		case FormatElementTrial:
			if c.Element == t.Element {
				m = f.ElementMultiplier
			}
		case FormatUnderdog:
			m = f.RarityBase[Common] / f.RarityBase[c.Rarity]
		}
		p := int(math.Round(float64(c.Score) * m))
		s.Cards = append(s.Cards, CardPoints{CardID: c.ID, Multiplier: m, Points: p})
		sum += p
		elements[c.Element] = true
	}
	if f.Kind == FormatHarmony && len(elements) > 1 {
		s.BonusPercent = f.HarmonyBonusPercent * (len(elements) - 1)
		s.Bonus = int(math.Round(float64(sum) * float64(s.BonusPercent) / 100))
	}
	s.Total = sum + s.Bonus
	return s
}

// EntryTotal is one player's scored entry.
type EntryTotal struct {
	UserID string
	Total  int
}

// RankedEntry is a final place: ranks run 1…n with no shared places.
type RankedEntry struct {
	EntryTotal
	Rank int
}

// SeedHash is the commitment published when entries open (hex SHA-256 of the seed); the
// seed itself is revealed when they close, so anyone can check ties weren't steered.
func SeedHash(seed []byte) string {
	h := sha256.Sum256(seed)
	return hex.EncodeToString(h[:])
}

// RankEntries orders entries by total, best first. Ties go by a roll from the committed
// seed (SHA-256 of seed + user id), so neither entry time nor anyone's choice decides them.
func RankEntries(entries []EntryTotal, seed []byte) []RankedEntry {
	roll := func(user string) []byte {
		h := sha256.Sum256(append(slices.Clip(seed), user...))
		return h[:]
	}
	out := make([]RankedEntry, len(entries))
	for i, e := range entries {
		out[i] = RankedEntry{EntryTotal: e}
	}
	slices.SortStableFunc(out, func(a, b RankedEntry) int {
		return cmp.Or(
			cmp.Compare(b.Total, a.Total),
			bytes.Compare(roll(a.UserID), roll(b.UserID)),
			cmp.Compare(a.UserID, b.UserID),
		)
	})
	for i := range out {
		out[i].Rank = i + 1
	}
	return out
}
