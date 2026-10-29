package auth

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"unicode"
)

// Usernames: 3-20 of a-z, 0-9, _ (matches the CHECK in migration 00002).
const (
	minUsername = 3
	maxUsername = 20
	// Room left for a "_1234" suffix when the base name is taken.
	maxBase = maxUsername - 5
)

const fallbackUsername = "player"

// BaseUsername turns a display name or email into a username candidate:
// lower-case ASCII letters, digits and single underscores. Names with no usable
// characters (e.g. written only in Sinhala script) fall back to "player".
func BaseUsername(name string) string {
	if base := SanitizeUsername(name); len(base) >= minUsername {
		return base
	}
	return fallbackUsername
}

// SanitizeUsername is BaseUsername without the fallback; it may return fewer
// than 3 characters (or none) when the name has too few usable characters.
func SanitizeUsername(name string) string {
	if at := strings.IndexByte(name, '@'); at >= 0 {
		name = name[:at]
	}
	var b strings.Builder
	lastUnderscore := true // no leading underscore
	for _, r := range strings.ToLower(name) {
		switch {
		case r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
			lastUnderscore = false
		case !lastUnderscore:
			b.WriteByte('_')
			lastUnderscore = true
		}
	}
	base := strings.Trim(b.String(), "_")
	if len(base) > maxBase {
		base = strings.TrimRight(base[:maxBase], "_")
	}
	return base
}

// UsernameCandidates yields the base name first, then base_NNNN with random digits.
func UsernameCandidates(base string, n int, rng *rand.Rand) []string {
	out := []string{base}
	for len(out) < n {
		out = append(out, fmt.Sprintf("%s_%04d", base, rng.IntN(10000)))
	}
	return out
}

// ValidUsername reports whether s is a stored-form username.
func ValidUsername(s string) bool {
	if len(s) < minUsername || len(s) > maxUsername {
		return false
	}
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '_') {
			return false
		}
	}
	return true
}
