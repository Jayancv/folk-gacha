package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	src := `
# comment
PORT=8081
DATABASE_URL=postgres://u:p@localhost:55432/db?sslmode=disable
QUOTED="hello world"
SINGLE='a=b'
export EXPORTED=yes
EMPTY=
  SPACED  =  value
`
	got, err := Parse(bufio.NewScanner(strings.NewReader(src)))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"PORT":         "8081",
		"DATABASE_URL": "postgres://u:p@localhost:55432/db?sslmode=disable",
		"QUOTED":       "hello world",
		"SINGLE":       "a=b",
		"EXPORTED":     "yes",
		"EMPTY":        "",
		"SPACED":       "value",
	}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q", k, got[k], v)
		}
	}
}

func TestParseRejectsBadLines(t *testing.T) {
	for _, bad := range []string{"NOEQUALS", "=value", "TWO WORDS=x"} {
		if _, err := Parse(bufio.NewScanner(strings.NewReader(bad))); err == nil {
			t.Errorf("%q should be rejected", bad)
		}
	}
}

func TestLoadDotEnvFindsParentAndKeepsRealEnv(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("FG_TEST_A=from-file\nFG_TEST_B=from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(root, "server")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Chdir(sub)
	t.Setenv("FG_TEST_B", "from-shell")
	os.Unsetenv("FG_TEST_A")
	t.Cleanup(func() { os.Unsetenv("FG_TEST_A") })

	path, err := LoadDotEnv()
	if err != nil {
		t.Fatal(err)
	}
	if path != filepath.Join(root, ".env") {
		t.Fatalf("loaded %q", path)
	}
	if os.Getenv("FG_TEST_A") != "from-file" {
		t.Errorf("FG_TEST_A = %q, want from-file", os.Getenv("FG_TEST_A"))
	}
	if os.Getenv("FG_TEST_B") != "from-shell" {
		t.Errorf("a real environment variable must win over .env, got %q", os.Getenv("FG_TEST_B"))
	}
}
