package httpapi

import (
	"context"
	"encoding/base64"
	"fmt"
	"testing"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/push"
	"cardgame/server/internal/store"
)

type noSender struct{}

func (noSender) Send(context.Context, push.Subscription, []byte) (int, error) { return 201, nil }

func TestPushDisabledWithoutKeys(t *testing.T) {
	rec := newTestServer(AuthOptions{}).do(t, "GET", "/push/key", "", nil)
	if rec.Code != 404 || decode[Error](t, rec).Error != "push_disabled" {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set).
func TestPushSubscriptionsOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, push_subscriptions CASCADE"); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{
		Auth:          auth.NewService(store.New(pool)),
		Push:          push.NewService(pool, noSender{}),
		PushPublicKey: "BPublicKeyForTests",
	}, AuthOptions{DevLogin: true}).Handler(nil)}

	if rec := ts.do(t, "GET", "/push/key", "", nil); rec.Code != 200 || decode[PushKey](t, rec).PublicKey != "BPublicKeyForTests" {
		t.Fatalf("key: %d %s", rec.Code, rec.Body)
	}

	p256dh := base64.RawURLEncoding.EncodeToString(append([]byte{4}, make([]byte, 64)...))
	auth := base64.RawURLEncoding.EncodeToString(make([]byte, 16))
	body := func(endpoint string) string {
		return fmt.Sprintf(`{"endpoint":%q,"keys":{"p256dh":%q,"auth":%q}}`, endpoint, p256dh, auth)
	}
	good := body("https://fcm.googleapis.com/fcm/send/abc")

	if rec := ts.do(t, "POST", "/push/subscriptions", good, nil); rec.Code != 401 {
		t.Fatalf("signed out: %d", rec.Code)
	}
	cookie := sessionFrom(t, ts.do(t, "POST", "/auth/dev", `{"name":"notified"}`, nil))
	if rec := ts.do(t, "POST", "/push/subscriptions", good, cookie); rec.Code != 204 {
		t.Fatalf("subscribe: %d %s", rec.Code, rec.Body)
	}
	if rec := ts.do(t, "POST", "/push/subscriptions", body("https://internal.example/hook"), cookie); rec.Code != 400 || decode[Error](t, rec).Error != "bad_subscription" {
		t.Fatalf("bad endpoint: %d %s", rec.Code, rec.Body)
	}

	count := func() int {
		var n int
		_ = pool.QueryRow(ctx, "SELECT count(*) FROM push_subscriptions").Scan(&n)
		return n
	}
	if count() != 1 {
		t.Fatalf("subscriptions = %d", count())
	}
	if rec := ts.do(t, "DELETE", "/push/subscriptions", `{"endpoint":"https://fcm.googleapis.com/fcm/send/abc"}`, cookie); rec.Code != 204 || count() != 0 {
		t.Fatalf("unsubscribe: %d, left %d", rec.Code, count())
	}
}

// Trade notifications are on by default and can be switched off and on again.
func TestTradeNotificationSettingOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, push_subscriptions CASCADE"); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{
		Auth:          auth.NewService(store.New(pool)),
		Push:          push.NewService(pool, noSender{}),
		PushPublicKey: "BPublicKeyForTests",
	}, AuthOptions{DevLogin: true}).Handler(nil)}

	if rec := ts.do(t, "PUT", "/me/notifications", `{"trades":false}`, nil); rec.Code != 401 {
		t.Fatalf("signed out: %d", rec.Code)
	}
	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"asha"}`, nil)
	cookie := sessionFrom(t, signIn)
	if !decode[Me](t, signIn).NotifyTrades {
		t.Fatal("trade notifications should start on")
	}
	for _, on := range []bool{false, true} {
		body := `{"trades":false}`
		if on {
			body = `{"trades":true}`
		}
		if rec := ts.do(t, "PUT", "/me/notifications", body, cookie); rec.Code != 204 {
			t.Fatalf("set %v: %d %s", on, rec.Code, rec.Body)
		}
		if got := decode[Me](t, ts.do(t, "GET", "/me", "", cookie)).NotifyTrades; got != on {
			t.Fatalf("after set %v: %v", on, got)
		}
	}
}
