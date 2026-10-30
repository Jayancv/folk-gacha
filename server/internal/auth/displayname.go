package auth

import (
	"strings"
	"unicode"
)

// MaxDisplayName matches the CHECK on users.display_name (migration 00008).
const MaxDisplayName = 60

// CleanDisplayName tidies a full name from a sign-in provider for showing back to the
// player: any script is fine (Sinhala, Tamil…), but control and invisible formatting
// characters (e.g. right-to-left overrides, which can disguise text) are removed,
// runs of spaces become one, and it is cut to MaxDisplayName characters.
func CleanDisplayName(name string) string {
	var b strings.Builder
	space := false
	for _, r := range name {
		switch {
		case unicode.IsSpace(r):
			space = true
		case unicode.IsControl(r) || unicode.Is(unicode.Cf, r):
			// dropped
		default:
			if space && b.Len() > 0 {
				b.WriteByte(' ')
			}
			space = false
			b.WriteRune(r)
		}
	}
	runes := []rune(b.String())
	if len(runes) > MaxDisplayName {
		runes = []rune(strings.TrimSpace(string(runes[:MaxDisplayName])))
	}
	return string(runes)
}
