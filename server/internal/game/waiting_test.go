package game

import (
	"testing"
	"time"
)

func TestWaitingPacks(t *testing.T) {
	defer func(n int) { StoredPacks = n }(StoredPacks)
	StoredPacks = 3
	day := func(d int) time.Time { return time.Date(2026, 11, d, 0, 0, 0, 0, time.UTC) }
	now := time.Date(2026, 11, 10, 15, 30, 0, 0, time.UTC)
	joined := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	dates := func(ds []time.Time) []int {
		out := []int{}
		for _, d := range ds {
			out = append(out, d.Day())
		}
		return out
	}
	cases := []struct {
		name    string
		joined  time.Time
		claimed []time.Time
		want    []int
	}{
		{"away a week: only the last 3 packs wait", joined, []time.Time{day(3)}, []int{8, 9, 10}},
		{"opened today", joined, []time.Time{day(10)}, []int{8, 9}},
		{"opened every day", joined, []time.Time{day(8), day(9), day(10)}, []int{}},
		{"skipped yesterday", joined, []time.Time{day(8), day(10)}, []int{9}},
		{"joined today: just today's", time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC), nil, []int{10}},
		{"joined yesterday", time.Date(2026, 11, 9, 23, 59, 0, 0, time.UTC), nil, []int{9, 10}},
	}
	for _, c := range cases {
		if got := dates(WaitingPacks(now, c.joined, c.claimed)); len(got) != len(c.want) || (len(got) > 0 && got[0] != c.want[0]) || (len(got) > 1 && got[len(got)-1] != c.want[len(c.want)-1]) {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
	if got := OldestStoredDay(now); !got.Equal(day(8)) {
		t.Errorf("oldest stored day %v", got)
	}

	// 5 cards = no saving up: only today's pack.
	StoredPacks = 1
	if got := dates(WaitingPacks(now, joined, nil)); len(got) != 1 || got[0] != 10 {
		t.Errorf("no saving up: %v", got)
	}
}
