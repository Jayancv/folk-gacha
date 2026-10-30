package auth_test

import (
	"bytes"
	"context"
	"errors"
	"math/rand/v2"
	"strings"
	"testing"
	"time"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/auth/authtest"
)

func TestBaseUsername(t *testing.T) {
	tests := []struct{ in, want string }{
		{"Asha Perera", "asha_perera"},
		{"  Kamal--Silva!! ", "kamal_silva"},
		{"nimal.fernando@gmail.com", "nimal_fernando"},
		{"ÉMILE", "mile"},
		{"අසංක", "player"}, // Sinhala-only names fall back
		{"Jo", "player"},   // too short
		{"a_very_long_display_name_indeed", "a_very_long_dis"},
		{"___x__y___z", "x_y_z"},
	}
	for _, tt := range tests {
		if got := auth.BaseUsername(tt.in); got != tt.want {
			t.Errorf("BaseUsername(%q) = %q, want %q", tt.in, got, tt.want)
		}
		if !auth.ValidUsername(auth.BaseUsername(tt.in)) {
			t.Errorf("BaseUsername(%q) is not a valid username", tt.in)
		}
	}
}

func TestUsernameCandidatesFitTheLimit(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	base := auth.BaseUsername(strings.Repeat("x", 50))
	for _, c := range auth.UsernameCandidates(base, 20, rng) {
		if !auth.ValidUsername(c) {
			t.Fatalf("candidate %q is not a valid username", c)
		}
	}
}

func TestValidUsername(t *testing.T) {
	for _, ok := range []string{"abc", "asha_2", strings.Repeat("a", 20)} {
		if !auth.ValidUsername(ok) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "ab", "Asha", "a-b-c", "asha perera", strings.Repeat("a", 21)} {
		if auth.ValidUsername(bad) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}

func TestTokens(t *testing.T) {
	a, b := auth.NewToken(), auth.NewToken()
	if a == b || len(a) < 40 {
		t.Fatalf("tokens should be long and unique: %q %q", a, b)
	}
	if !bytes.Equal(auth.HashToken(a), auth.HashToken(a)) || bytes.Equal(auth.HashToken(a), auth.HashToken(b)) {
		t.Fatal("hash must be deterministic and distinct per token")
	}
	if bytes.Contains(auth.HashToken(a), []byte(a)) {
		t.Fatal("hash must not contain the token")
	}
}

func TestSignInCreatesThenReusesTheAccount(t *testing.T) {
	ctx := context.Background()
	db := authtest.NewMemStore()
	svc := auth.NewService(db)

	first, err := svc.SignIn(ctx, "google:123", "Asha Perera")
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.SignIn(ctx, "google:123", "Someone Else")
	if err != nil {
		t.Fatal(err)
	}
	if first.User.ID != second.User.ID || second.User.Username != "asha_perera" {
		t.Fatalf("same Google account must map to the same user: %+v vs %+v", first.User, second.User)
	}
	if first.Token == second.Token {
		t.Fatal("each sign-in gets its own session token")
	}
	if got := first.User.TradeUnlockedAt.Sub(first.User.CreatedAt); got != 7*24*time.Hour {
		t.Fatalf("trade unlock = created + %v, want 7 days", got)
	}
}

func TestSignInPicksAFreeUsername(t *testing.T) {
	ctx := context.Background()
	svc := auth.NewService(authtest.NewMemStore())

	a, _ := svc.SignIn(ctx, "google:1", "Asha")
	b, err := svc.SignIn(ctx, "google:2", "asha")
	if err != nil {
		t.Fatal(err)
	}
	if a.User.Username != "asha" || !strings.HasPrefix(b.User.Username, "asha_") || !auth.ValidUsername(b.User.Username) {
		t.Fatalf("usernames %q and %q: second should be asha_NNNN", a.User.Username, b.User.Username)
	}
}

func TestSessions(t *testing.T) {
	ctx := context.Background()
	db := authtest.NewMemStore()
	svc := auth.NewService(db)
	sess, _ := svc.SignIn(ctx, "dev:asha", "asha")

	u, err := svc.UserForToken(ctx, sess.Token)
	if err != nil || u.ID != sess.User.ID {
		t.Fatalf("UserForToken = %v, %v", u, err)
	}
	if _, err := svc.UserForToken(ctx, "not-a-token"); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("unknown token: err = %v, want ErrNoSession", err)
	}
	if _, err := svc.UserForToken(ctx, ""); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("empty token: err = %v, want ErrNoSession", err)
	}

	// Expired after the TTL.
	db.Now = func() time.Time { return time.Now().Add(auth.SessionTTL + time.Minute) }
	if _, err := svc.UserForToken(ctx, sess.Token); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("expired session: err = %v, want ErrNoSession", err)
	}
	db.Now = time.Now

	if err := svc.SignOut(ctx, sess.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UserForToken(ctx, sess.Token); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("after sign-out: err = %v, want ErrNoSession", err)
	}
}

func TestDatabaseErrorsAreNotTreatedAsSignedOut(t *testing.T) {
	db := authtest.NewMemStore()
	svc := auth.NewService(db)
	db.Fail = errors.New("connection refused")
	_, err := svc.UserForToken(context.Background(), "some-token")
	if err == nil || errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("err = %v; a database outage must not look like 'not signed in'", err)
	}
}

func TestSignInKeepsTheDisplayNameUpToDate(t *testing.T) {
	ctx := context.Background()
	svc := auth.NewService(authtest.NewMemStore())

	first, err := svc.SignInWithDisplayName(ctx, "google:42", "Jayan Vidanapathirana", "  Jayan   Vidanapathirana ")
	if err != nil {
		t.Fatal(err)
	}
	if first.User.DisplayName != "Jayan Vidanapathirana" || first.User.Username != "jayan_vidanapat" {
		t.Fatalf("first sign-in: %q / %q", first.User.DisplayName, first.User.Username)
	}
	// The name changed in Google: updated on the next sign-in; the username stays.
	again, err := svc.SignInWithDisplayName(ctx, "google:42", "J V", "Jayan C. Vidanapathirana")
	if err != nil {
		t.Fatal(err)
	}
	if again.User.ID != first.User.ID || again.User.DisplayName != "Jayan C. Vidanapathirana" || again.User.Username != "jayan_vidanapat" {
		t.Fatalf("second sign-in: %+v", again.User)
	}
	// No name from the provider (or a dev login) keeps the stored one.
	dev, err := svc.SignIn(ctx, "google:42", "whatever")
	if err != nil || dev.User.DisplayName != "Jayan C. Vidanapathirana" {
		t.Fatalf("plain sign-in changed the name: %q (%v)", dev.User.DisplayName, err)
	}
}
