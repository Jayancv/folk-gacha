package collection

import (
	"errors"
	"testing"
)

func TestNormalizeDefaults(t *testing.T) {
	f, err := Filter{}.Normalize()
	if err != nil || f.Sort != SortNewest || f.Limit != DefaultLimit || f.Offset != 0 {
		t.Fatalf("got %+v, %v", f, err)
	}
	f, err = Filter{Sort: SortScore, Limit: MaxLimit, Offset: 120, Level: 5, Rarities: []string{"rare", "epic"}}.Normalize()
	if err != nil || f.Sort != SortScore || f.Limit != MaxLimit || f.Offset != 120 {
		t.Fatalf("valid filter changed: %+v, %v", f, err)
	}
}

func TestNormalizeRejects(t *testing.T) {
	for name, f := range map[string]Filter{
		"unknown rarity":  {Rarities: []string{"mythic"}},
		"level too high":  {Level: 6},
		"negative level":  {Level: -1},
		"negative offset": {Offset: -1},
		"limit too big":   {Limit: MaxLimit + 1},
		"unknown sort":    {Sort: "random"},
	} {
		if _, err := f.Normalize(); !errors.Is(err, ErrBadFilter) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}
