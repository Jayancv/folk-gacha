package game

import "testing"

func TestCollectionPower(t *testing.T) {
	tests := []struct {
		name   string
		scores []int
		want   int
	}{
		{"no cards", nil, 0},
		{"fewer than ten counts them all", []int{10, 25, 60}, 95},
		{"only the best ten count", []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}, 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12},
		{"order doesn't matter", []int{400, 10, 400, 10}, 820},
	}
	for _, tt := range tests {
		if got := CollectionPower(tt.scores); got != tt.want {
			t.Errorf("%s: got %d, want %d", tt.name, got, tt.want)
		}
	}
	in := []int{3, 1, 2}
	CollectionPower(in)
	if in[0] != 3 || in[1] != 1 {
		t.Error("CollectionPower reordered the caller's slice")
	}
}
