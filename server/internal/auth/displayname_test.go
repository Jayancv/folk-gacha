package auth

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// r makes a string from rune numbers, so invisible and non-Latin test characters
// are visible in this file (it stays plain ASCII).
func r(codes ...rune) string { return string(codes) }

func TestCleanDisplayName(t *testing.T) {
	var (
		sinhala   = r(0x0DA2, 0x0DBA, 0x0DB1, 0x0DCA)
		rtl       = r(0x202E) // right-to-left override
		zeroWidth = r(0x200B)
		bell      = r(0x0007)
		newline   = r(0x000A)
	)
	tests := []struct{ in, want string }{
		{"Jayan Vidanapathirana", "Jayan Vidanapathirana"},
		{"  Asha   Perera " + newline, "Asha Perera"},
		{sinhala, sinhala}, // any script is kept
		{"Nimal" + rtl + "admin", "Nimaladmin"},
		{"Kumari" + bell + " Silva", "Kumari Silva"},
		{"zero" + zeroWidth + "width", "zerowidth"},
		{"", ""},
		{"   ", ""},
	}
	for _, tt := range tests {
		if got := CleanDisplayName(tt.in); got != tt.want {
			t.Errorf("CleanDisplayName(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
	long := CleanDisplayName(strings.Repeat(r(0x0DA2), 100))
	if utf8.RuneCountInString(long) != MaxDisplayName {
		t.Errorf("long name kept %d characters, want %d", utf8.RuneCountInString(long), MaxDisplayName)
	}
}
