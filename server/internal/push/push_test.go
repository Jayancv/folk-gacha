package push_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/push"
	"cardgame/server/internal/store"
)

// Integration tests against real Postgres (skipped unless TEST_DATABASE_URL is set; see dbtest).

var (
	friday = time.Date(2026, 10, 30, 0, 1, 0, 0, time.UTC)
	p256dh = base64.RawURLEncoding.EncodeToString(append([]byte{4}, make([]byte, 64)...))
	auth   = base64.RawURLEncoding.EncodeToString(make([]byte, 16))
)

// fakeSender records what was sent and answers with a status per endpoint (default 201).
type fakeSender struct {
	mu     sync.Mutex
	sent   []string
	status map[string]int
	body   []byte
}

func (f *fakeSender) Send(_ context.Context, sub push.Subscription, payload []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, sub.Endpoint)
	f.body = payload
	if st, ok := f.status[sub.Endpoint]; ok {
		if st < 0 {
			return 0, errors.New("network down")
		}
		return st, nil
	}
	return 201, nil
}

func (f *fakeSender) endpoints() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := append([]string(nil), f.sent...)
	sort.Strings(out)
	f.sent = nil
	return out
}

func setup(t *testing.T) (*pgxpool.Pool, *fakeSender, *push.Service) {
	t.Helper()
	pool := dbtest.Pool(t)
	if _, err := pool.Exec(context.Background(), "TRUNCATE users, push_subscriptions, push_runs CASCADE"); err != nil {
		t.Fatal(err)
	}
	sender := &fakeSender{status: map[string]int{}}
	svc := push.NewService(pool, sender)
	svc.Now = func() time.Time { return friday }
	return pool, sender, svc
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	u, err := store.New(pool).CreateUser(context.Background(), store.CreateUserParams{AuthID: "test:" + name, Username: name})
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func endpoint(name string) string { return "https://fcm.googleapis.com/fcm/send/" + name }

func subscribe(t *testing.T, svc *push.Service, user uuid.UUID, name string) {
	t.Helper()
	if err := svc.Subscribe(context.Background(), user, push.Subscription{Endpoint: endpoint(name), P256dh: p256dh, Auth: auth}); err != nil {
		t.Fatal(err)
	}
}

func claim(t *testing.T, pool *pgxpool.Pool, user uuid.UUID, day time.Time) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `INSERT INTO card_seasons (id, name, seed, card_count) VALUES ('s1', 'S1', 1, 1500) ON CONFLICT DO NOTHING`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO daily_claims (user_id, day, card_season_id, pity_counter) VALUES ($1, $2, 's1', 1)`, user, day); err != nil {
		t.Fatal(err)
	}
}

func eq(t *testing.T, what string, got []string, want ...string) {
	t.Helper()
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}

func TestDailyPushGoesToPlayersWhoHaventClaimed(t *testing.T) {
	pool, sender, svc := setup(t)
	ctx := context.Background()
	asha, nimal := newUser(t, pool, "asha"), newUser(t, pool, "nimal")
	subscribe(t, svc, asha, "asha-phone")
	subscribe(t, svc, asha, "asha-laptop")
	subscribe(t, svc, nimal, "nimal-phone")
	claim(t, pool, nimal, friday)                  // already opened today's pack
	claim(t, pool, asha, friday.AddDate(0, 0, -1)) // yesterday's doesn't count

	res, err := svc.SendPackReady(ctx)
	if err != nil || !res.Ran || res.Sent != 2 {
		t.Fatalf("result %+v (%v)", res, err)
	}
	eq(t, "sent to", sender.endpoints(), endpoint("asha-laptop"), endpoint("asha-phone"))

	var msg push.Message
	if err := json.Unmarshal(sender.body, &msg); err != nil || msg.Title == "" || msg.Tag != "daily-pack" || msg.URL != "/" {
		t.Fatalf("payload %s (%v)", sender.body, err)
	}

	// Once per day: running again (or on another server) sends nothing.
	again, err := svc.SendPackReady(ctx)
	if err != nil || again.Ran {
		t.Fatalf("second run %+v (%v)", again, err)
	}
	eq(t, "second run sent to", sender.endpoints())

	// The next day goes out again.
	svc.Now = func() time.Time { return friday.AddDate(0, 0, 1) }
	if res, _ := svc.SendPackReady(ctx); !res.Ran || res.Sent != 3 {
		t.Fatalf("next day %+v", res)
	}
}

func TestSeveralServersSendOnce(t *testing.T) {
	pool, sender, svc := setup(t)
	user := newUser(t, pool, "solo")
	subscribe(t, svc, user, "solo-phone")

	var wg sync.WaitGroup
	for range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := svc.SendPackReady(context.Background()); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	eq(t, "sent to", sender.endpoints(), endpoint("solo-phone"))
}

func TestGoneAndFailingSubscriptionsAreDropped(t *testing.T) {
	pool, sender, svc := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "mixed")
	for _, n := range []string{"gone", "expired", "flaky", "fine"} {
		subscribe(t, svc, user, n)
	}
	sender.status[endpoint("gone")] = 410    // unsubscribed
	sender.status[endpoint("expired")] = 404 // uninstalled
	sender.status[endpoint("flaky")] = -1    // network error

	res, err := svc.SendPackReady(ctx)
	if err != nil || res.Sent != 1 || res.Dropped != 2 || res.Failed != 1 {
		t.Fatalf("result %+v (%v)", res, err)
	}
	left := func() []string {
		rows, _ := pool.Query(ctx, "SELECT endpoint FROM push_subscriptions ORDER BY endpoint")
		defer rows.Close()
		var out []string
		for rows.Next() {
			var e string
			_ = rows.Scan(&e)
			out = append(out, e)
		}
		return out
	}
	eq(t, "left after a run", left(), endpoint("fine"), endpoint("flaky"))

	// A subscription that keeps failing is dropped after MaxFailures runs in a row.
	for day := 1; day < push.MaxFailures; day++ {
		svc.Now = func() time.Time { return friday.AddDate(0, 0, day) }
		if _, err := svc.SendPackReady(ctx); err != nil {
			t.Fatal(err)
		}
	}
	eq(t, "left after repeated failures", left(), endpoint("fine"))
}

func TestSubscribeAndUnsubscribe(t *testing.T) {
	pool, _, svc := setup(t)
	ctx := context.Background()
	asha, nimal := newUser(t, pool, "asha"), newUser(t, pool, "nimal")
	subscribe(t, svc, asha, "shared-tablet")
	owner := func() string {
		var u string
		_ = pool.QueryRow(ctx, "SELECT u.username FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE s.endpoint = $1", endpoint("shared-tablet")).Scan(&u)
		return u
	}

	// Another player signs in on the same browser: the subscription moves to them.
	subscribe(t, svc, nimal, "shared-tablet")
	if owner() != "nimal" {
		t.Fatalf("owner = %q", owner())
	}
	// asha can't remove nimal's subscription; nimal can.
	if err := svc.Unsubscribe(ctx, asha, endpoint("shared-tablet")); err != nil || owner() != "nimal" {
		t.Fatalf("asha removed nimal's subscription (%v)", err)
	}
	if err := svc.Unsubscribe(ctx, nimal, endpoint("shared-tablet")); err != nil || owner() != "" {
		t.Fatalf("still subscribed (%v)", err)
	}

	bad := push.Subscription{Endpoint: "https://169.254.169.254/latest", P256dh: p256dh, Auth: auth}
	if err := svc.Subscribe(ctx, asha, bad); !errors.Is(err, push.ErrBadSubscription) {
		t.Fatalf("bad endpoint: %v", err)
	}
}

// A run that claimed the day but never finished (error or crash) is retried once stale,
// but a finished run, or one still in progress, is not.
func TestUnfinishedRunIsTakenOverWhenStale(t *testing.T) {
	pool, sender, svc := setup(t)
	ctx := context.Background()
	user := newUser(t, pool, "waiting")
	subscribe(t, svc, user, "phone")
	if _, err := pool.Exec(ctx, `INSERT INTO push_runs (day, started_at) VALUES ($1, now() - interval '1 minute')`, friday); err != nil {
		t.Fatal(err)
	}
	if res, _ := svc.SendPackReady(ctx); res.Ran {
		t.Fatal("took over a run that's still in progress")
	}
	if _, err := pool.Exec(ctx, `UPDATE push_runs SET started_at = now() - interval '20 minutes' WHERE day = $1`, friday); err != nil {
		t.Fatal(err)
	}
	res, err := svc.SendPackReady(ctx)
	if err != nil || !res.Ran || res.Sent != 1 {
		t.Fatalf("stale run not retried: %+v (%v)", res, err)
	}
	eq(t, "sent to", sender.endpoints(), endpoint("phone"))
	if res, _ := svc.SendPackReady(ctx); res.Ran {
		t.Fatal("a finished run ran again")
	}
}
