package game

import (
	"testing"
	"time"
)

func utc(y int, m time.Month, d, h, min, s, ns int) time.Time {
	return time.Date(y, m, d, h, min, s, ns, time.UTC)
}

func TestSeasonRunsMondayToMondayUTC(t *testing.T) {
	// 30 Oct 2026 is a Friday in ISO week 44.
	want := Season{ID: "2026-W44", StartsAt: utc(2026, 10, 26, 0, 0, 0, 0), EndsAt: utc(2026, 11, 2, 0, 0, 0, 0)}
	for _, at := range []time.Time{
		utc(2026, 10, 26, 0, 0, 0, 0),           // Monday 00:00 starts it
		utc(2026, 10, 30, 12, 0, 0, 0),          // Friday
		utc(2026, 11, 1, 23, 59, 59, 999999999), // Sunday 23:59:59.999… is still in it
	} {
		if got := SeasonFor(at); got != want {
			t.Errorf("SeasonFor(%v) = %+v, want %+v", at, got, want)
		}
	}
	if got := SeasonFor(utc(2026, 11, 2, 0, 0, 0, 0)); got.ID != "2026-W45" || !got.StartsAt.Equal(want.EndsAt) {
		t.Errorf("Monday 00:00 starts the next season, got %+v", got)
	}
}

func TestSeasonUsesUTCNotLocalTime(t *testing.T) {
	// Monday 03:00 in Colombo is still Sunday 21:30 UTC: last week's season.
	colombo := time.FixedZone("IST", 5*3600+1800)
	if got := SeasonFor(time.Date(2026, 11, 2, 3, 0, 0, 0, colombo)); got.ID != "2026-W44" {
		t.Errorf("got %s, want 2026-W44", got.ID)
	}
}

func TestSeasonIDsAcrossYearBoundaries(t *testing.T) {
	tests := []struct {
		at   time.Time
		want string
	}{
		{utc(2026, 12, 31, 12, 0, 0, 0), "2026-W53"}, // 2026 has 53 ISO weeks
		{utc(2027, 1, 1, 12, 0, 0, 0), "2026-W53"},   // Friday 1 Jan belongs to the last week of 2026
		{utc(2027, 1, 3, 23, 0, 0, 0), "2026-W53"},
		{utc(2027, 1, 4, 0, 0, 0, 0), "2027-W01"},
		{utc(2025, 12, 29, 0, 0, 0, 0), "2026-W01"}, // Monday 29 Dec 2025 starts week 1 of 2026
	}
	for _, tt := range tests {
		if got := SeasonFor(tt.at).ID; got != tt.want {
			t.Errorf("SeasonFor(%v) = %s, want %s", tt.at, got, tt.want)
		}
	}
}

func TestSeasonsTileTimeWithoutGaps(t *testing.T) {
	s := SeasonFor(utc(2025, 1, 1, 0, 0, 0, 0))
	seen := map[string]bool{}
	for range 3 * 53 { // three years of weeks
		if s.EndsAt.Sub(s.StartsAt) != 7*24*time.Hour || s.StartsAt.Weekday() != time.Monday {
			t.Fatalf("bad season %+v", s)
		}
		if seen[s.ID] {
			t.Fatalf("season id %s used twice", s.ID)
		}
		seen[s.ID] = true
		next := SeasonFor(s.EndsAt)
		if !next.StartsAt.Equal(s.EndsAt) {
			t.Fatalf("gap after %s", s.ID)
		}
		s = next
	}
}

func TestReadyToFinalize(t *testing.T) {
	end := utc(2026, 11, 2, 0, 0, 0, 0)
	if ReadyToFinalize(end, end) || ReadyToFinalize(end, end.Add(FinalizeGrace-time.Nanosecond)) {
		t.Fatal("finalized before the grace period")
	}
	if !ReadyToFinalize(end, end.Add(FinalizeGrace)) {
		t.Fatal("not finalized after the grace period")
	}
}
