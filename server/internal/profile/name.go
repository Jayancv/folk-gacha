package profile

import (
	"errors"
	"strings"
	"unicode"
)

// Public name limits, in characters (runes).
const (
	MinPublicName = 2
	MaxPublicName = 20
)

// ErrBadName: a public name that is too short or long, or uses characters names can't have.
var ErrBadName = errors.New("profile: invalid name")

const (
	zwnj = '‌' // zero-width non-joiner
	zwj  = '‍' // zero-width joiner: Sinhala needs it (ශ්‍රී), so it stays between letters
)

// CleanPublicName checks and tidies the name a player wants to show: spaces trimmed and
// collapsed, then 2–20 characters of letters (any script), combining marks, digits, spaces
// and . - _ ' with at least one letter. Joiners are kept only inside a word. Anything else
// (emoji, symbols, "@", invisible or direction-changing characters) is refused rather than
// silently dropped, so what the player typed is what everyone sees. "" means "no name".
func CleanPublicName(name string) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" {
		return "", nil
	}
	runes := []rune(name)
	letters := 0
	for i, r := range runes {
		switch {
		case blankLetter(r):
			return "", ErrBadName
		case unicode.IsLetter(r):
			letters++
		case unicode.IsMark(r), unicode.IsDigit(r), r == ' ', r == '.', r == '-', r == '_', r == '\'':
		case r == zwj || r == zwnj:
			// Only between two letters or marks of a word.
			if i == 0 || i == len(runes)-1 || !inWord(runes[i-1]) || !inWord(runes[i+1]) {
				return "", ErrBadName
			}
		default:
			return "", ErrBadName
		}
	}
	if letters == 0 || len(runes) < MinPublicName || len(runes) > MaxPublicName {
		return "", ErrBadName
	}
	return name, nil
}

// blankLetter: Hangul fillers count as letters but draw nothing, so a name of them looks
// empty (or hides a space inside another player's name).
func blankLetter(r rune) bool {
	switch r {
	case '\u115F', '\u1160', '\u3164', '\uFFA0':
		return true
	}
	return false
}

func inWord(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsMark(r)
}
