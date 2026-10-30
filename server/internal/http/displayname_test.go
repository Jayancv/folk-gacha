package httpapi

import (
	"context"
	"testing"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/auth/authtest"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/profile"
	"cardgame/server/internal/store"
)

func TestGoogleSignInReturnsTheFullName(t *testing.T) {
	ts := newTestServer(googleOpts())
	rec := ts.do(t, "POST", "/auth/google", `{"credential":"valid:sub-1:Jayan Vidanapathirana"}`, nil)
	me := decode[Me](t, rec)
	if me.DisplayName == nil || *me.DisplayName != "Jayan Vidanapathirana" || me.Username != "jayan_vidanapat" {
		t.Fatalf("me = %+v", me)
	}
	// /me returns it too.
	if again := decode[Me](t, ts.do(t, "GET", "/me", "", sessionFrom(t, rec))); again.DisplayName == nil || *again.DisplayName != "Jayan Vidanapathirana" {
		t.Fatalf("GET /me: %+v", again)
	}
	// Dev logins have no full name.
	if dev := decode[Me](t, newTestServer(AuthOptions{DevLogin: true}).do(t, "POST", "/auth/dev", `{"name":"tester"}`, nil)); dev.DisplayName != nil {
		t.Fatalf("dev login has a display name: %q", *dev.DisplayName)
	}
}

// The full name is personal: your own profile shows it, other players see only the username.
func TestFullNameOnlyOnYourOwnProfile(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users CASCADE"); err != nil {
		t.Fatal(err)
	}
	opts := googleOpts()
	opts.Verifier = authtest.FakeGoogle{}
	ts := testServer{h: NewServer(pool, Services{Auth: auth.NewService(store.New(pool)), Profiles: profile.NewService(pool)}, opts).Handler(nil)}

	jayan := sessionFrom(t, ts.do(t, "POST", "/auth/google", `{"credential":"valid:sub-j:Jayan Vidanapathirana"}`, nil))
	asha := sessionFrom(t, ts.do(t, "POST", "/auth/google", `{"credential":"valid:sub-a:Asha Perera"}`, nil))

	own := decode[Profile](t, ts.do(t, "GET", "/users/jayan_vidanapat", "", jayan))
	if own.DisplayName == nil || *own.DisplayName != "Jayan Vidanapathirana" {
		t.Fatalf("own profile: %+v", own.DisplayName)
	}
	seen := decode[Profile](t, ts.do(t, "GET", "/users/jayan_vidanapat", "", asha))
	if seen.DisplayName != nil || seen.Username != "jayan_vidanapat" {
		t.Fatalf("another player saw the full name %q", *seen.DisplayName)
	}
}
