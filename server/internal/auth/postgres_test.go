package auth_test

import (
	"context"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/store"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := dbtest.Pool(t)
	if _, err := pool.Exec(context.Background(), "TRUNCATE users CASCADE"); err != nil {
		t.Fatal(err)
	}
	return pool
}

func TestPostgresSignInAndSessions(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := auth.NewService(store.New(pool))

	a, err := svc.SignIn(ctx, "google:pg-1", "Asha Perera")
	if err != nil {
		t.Fatal(err)
	}
	if !a.User.TradeUnlockedAt.Equal(a.User.CreatedAt) {
		t.Fatalf("trade unlock %v, want at sign-up %v (column default: no wait)", a.User.TradeUnlockedAt, a.User.CreatedAt)
	}
	// A different player with the same name gets a suffixed username (unique index).
	b, err := svc.SignIn(ctx, "google:pg-2", "ASHA PERERA")
	if err != nil {
		t.Fatal(err)
	}
	if a.User.Username != "asha_perera" || b.User.Username == a.User.Username || !auth.ValidUsername(b.User.Username) {
		t.Fatalf("usernames %q / %q", a.User.Username, b.User.Username)
	}

	u, err := svc.UserForToken(ctx, a.Token)
	if err != nil || u.ID != a.User.ID {
		t.Fatalf("UserForToken: %v %v", u, err)
	}
	// Only the hash is stored.
	var stored int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM sessions WHERE token_hash = $1", []byte(a.Token)).Scan(&stored); err != nil || stored != 0 {
		t.Fatalf("raw token found in sessions table (%d, %v)", stored, err)
	}

	// Expired sessions are rejected by the query itself.
	if _, err := pool.Exec(ctx, "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", a.User.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UserForToken(ctx, a.Token); err == nil {
		t.Fatal("expired session still accepted")
	}

	if err := svc.SignOut(ctx, b.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UserForToken(ctx, b.Token); err == nil {
		t.Fatal("signed-out session still accepted")
	}
}

// Two first sign-ins for the same Google account at the same moment (e.g. a
// double tap on two tabs) must end up as one account, not two.
func TestPostgresConcurrentFirstSignIn(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := auth.NewService(store.New(pool))

	const n = 8
	ids := make([]string, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			s, err := svc.SignIn(ctx, "google:race", "Racer")
			ids[i], errs[i] = s.User.ID.String(), err
		}()
	}
	close(start)
	wg.Wait()

	for i := range n {
		if errs[i] != nil {
			t.Fatalf("sign-in %d: %v", i, errs[i])
		}
		if ids[i] != ids[0] {
			t.Fatalf("got different users %s and %s for one Google account", ids[0], ids[i])
		}
	}
	var users int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE auth_id = 'google:race'").Scan(&users); err != nil || users != 1 {
		t.Fatalf("users for google:race = %d (%v), want 1", users, err)
	}
}
