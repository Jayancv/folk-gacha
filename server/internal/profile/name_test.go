package profile

import (
	"errors"
	"testing"
)

func TestCleanPublicName(t *testing.T) {
	good := map[string]string{
		"  Asha   the  Brave ": "Asha the Brave",
		"Jayan V.":             "Jayan V.",
		"ශ්‍රී ලංකා":           "ශ්‍රී ලංකා", // ශ්‍රී ලංකා: Sinhala needs the joiner
		"நிலா":                 "நிலா",
		"o'neil-2_x":           "o'neil-2_x",
		"Zoë":                  "Zoë",
		"":                     "",
		"   ":                  "",
	}
	for in, want := range good {
		got, err := CleanPublicName(in)
		if err != nil || got != want {
			t.Errorf("CleanPublicName(%q) = %q, %v; want %q", in, got, err, want)
		}
	}

	bad := []string{
		"a",                     // too short
		"abcdefghijklmnopqrstu", // 21 characters
		"12345",                 // no letter
		"@asha",                 // looks like a handle
		"asha 🐉",                // emoji
		"asha‮gnp",              // right-to-left override
		"as​ha",                 // zero-width space
		"‍asha",                 // joiner at the start
		"asha ‍",                // joiner after a space
		"<b>asha</b>",           // markup
		"asha\x00",              // control character
	}
	for _, in := range bad {
		if got, err := CleanPublicName(in); !errors.Is(err, ErrBadName) {
			t.Errorf("CleanPublicName(%q) = %q, %v; want ErrBadName", in, got, err)
		}
	}
}
