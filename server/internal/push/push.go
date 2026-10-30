// Package push sends "your pack is ready" web push notifications: it stores each
// player's browser subscriptions and, once per UTC day, notifies the players who
// haven't claimed that day's pack yet.
package push

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/store"
)

// MaxFailures: a subscription that fails this many sends in a row is dropped.
const MaxFailures = 5

// ErrBadSubscription: the subscription isn't one a browser's push service would issue.
var ErrBadSubscription = errors.New("push: invalid subscription")

// Subscription is a browser's push subscription (PushSubscription.toJSON()).
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Sender delivers one push message and returns the push service's HTTP status.
type Sender interface {
	Send(ctx context.Context, sub Subscription, payload []byte) (status int, err error)
}

// pushHosts are the push services browsers use. The server POSTs to the endpoint a
// browser gives it, so only these hosts are accepted: an arbitrary URL would let a
// client make the server call anything (server-side request forgery).
var pushHosts = []string{
	"fcm.googleapis.com",         // Chrome, Edge, Samsung Internet, Opera, Android
	".push.services.mozilla.com", // Firefox
	".push.apple.com",            // Safari, iPhone and iPad home-screen apps
	".notify.windows.com",        // Legacy Edge / Windows
}

// Validate checks a subscription before it is stored.
func (s Subscription) Validate() error {
	u, err := url.Parse(s.Endpoint)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || len(s.Endpoint) > 2048 {
		return fmt.Errorf("%w: endpoint must be an https push service URL", ErrBadSubscription)
	}
	host := strings.ToLower(u.Hostname())
	known := false
	for _, h := range pushHosts {
		if host == strings.TrimPrefix(h, ".") || (strings.HasPrefix(h, ".") && strings.HasSuffix(host, h)) {
			known = true
		}
	}
	if !known {
		return fmt.Errorf("%w: unknown push service %q", ErrBadSubscription, host)
	}
	// p256dh is an uncompressed P-256 public key (65 bytes), auth a 16-byte secret.
	if n := decodedLen(s.P256dh); n != 65 {
		return fmt.Errorf("%w: p256dh key", ErrBadSubscription)
	}
	if n := decodedLen(s.Auth); n != 16 {
		return fmt.Errorf("%w: auth secret", ErrBadSubscription)
	}
	return nil
}

func decodedLen(s string) int {
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
	if err != nil {
		return -1
	}
	return len(b)
}

// Message is the notification the service worker shows (src/sw/sw.ts).
type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	// Tag replaces an older notification with the same tag instead of stacking.
	Tag string `json:"tag"`
}

var packReady = Message{
	Title: "Your daily pack is ready",
	Body:  "Open Folk Gacha to flip today's 5 cards.",
	URL:   "/",
	Tag:   "daily-pack",
}

// Service stores subscriptions and sends the daily push.
type Service struct {
	pool   *pgxpool.Pool
	sender Sender
	// Now is replaceable in tests.
	Now func() time.Time
	// Workers is how many pushes are sent at once.
	Workers int
}

func NewService(pool *pgxpool.Pool, sender Sender) *Service {
	return &Service{pool: pool, sender: sender, Now: time.Now, Workers: 8}
}

// Subscribe saves (or re-assigns) a browser subscription for the player.
func (s *Service) Subscribe(ctx context.Context, userID uuid.UUID, sub Subscription) error {
	if err := sub.Validate(); err != nil {
		return err
	}
	return store.New(s.pool).UpsertPushSubscription(ctx, store.UpsertPushSubscriptionParams{
		Endpoint: sub.Endpoint, UserID: userID, P256dh: sub.P256dh, Auth: sub.Auth,
	})
}

// Unsubscribe removes the player's subscription for that endpoint (no error if it's not theirs or gone).
func (s *Service) Unsubscribe(ctx context.Context, userID uuid.UUID, endpoint string) error {
	_, err := store.New(s.pool).DeletePushSubscription(ctx, store.DeletePushSubscriptionParams{Endpoint: endpoint, UserID: userID})
	return err
}

// Result of one day's send.
type Result struct {
	// Ran is false when today's push was already sent (by this or another server).
	Ran     bool
	Day     time.Time
	Sent    int
	Dropped int
	Failed  int
}

// SendPackReady sends today's "your pack is ready" push to every subscription of a
// player who hasn't claimed today's pack, at most once per UTC day across all servers.
func (s *Service) SendPackReady(ctx context.Context) (Result, error) {
	day := game.ClaimDay(s.Now())
	res := Result{Day: day}
	q := store.New(s.pool)
	claimed, err := q.ClaimPushRun(ctx, day)
	if err != nil || claimed == 0 {
		return res, err
	}
	res.Ran = true

	subs, err := q.ListPackReadySubscriptions(ctx, day)
	if err != nil {
		return res, err
	}
	payload, err := json.Marshal(packReady)
	if err != nil {
		return res, err
	}

	var mu sync.Mutex
	jobs := make(chan store.ListPackReadySubscriptionsRow)
	var wg sync.WaitGroup
	for range max(1, s.Workers) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for row := range jobs {
				outcome := s.deliver(ctx, q, Subscription{Endpoint: row.Endpoint, P256dh: row.P256dh, Auth: row.Auth}, payload)
				mu.Lock()
				switch outcome {
				case delivered:
					res.Sent++
				case dropped:
					res.Dropped++
				default:
					res.Failed++
				}
				mu.Unlock()
			}
		}()
	}
	for _, row := range subs {
		jobs <- row
	}
	close(jobs)
	wg.Wait()

	if err := q.FinishPushRun(ctx, store.FinishPushRunParams{Day: day, Sent: pgtype.Int4{Int32: int32(res.Sent), Valid: true}}); err != nil {
		return res, err
	}
	slog.InfoContext(ctx, "pack ready push sent", "day", day.Format(time.DateOnly), "sent", res.Sent, "dropped", res.Dropped, "failed", res.Failed)
	return res, nil
}

type outcome int

const (
	delivered outcome = iota
	dropped
	failed
)

func (s *Service) deliver(ctx context.Context, q *store.Queries, sub Subscription, payload []byte) outcome {
	status, err := s.sender.Send(ctx, sub, payload)
	switch {
	case err == nil && status >= 200 && status < 300:
		if err := q.RecordPushSuccess(ctx, sub.Endpoint); err != nil {
			slog.WarnContext(ctx, "push: record success", "err", err)
		}
		return delivered
	case err == nil && (status == 404 || status == 410):
		// The browser unsubscribed or the app was uninstalled: forget it.
		if err := q.DropPushSubscription(ctx, sub.Endpoint); err != nil {
			slog.WarnContext(ctx, "push: drop subscription", "err", err)
		}
		return dropped
	}
	failures, dbErr := q.RecordPushFailure(ctx, sub.Endpoint)
	if dbErr == nil && failures >= MaxFailures {
		if err := q.DropPushSubscription(ctx, sub.Endpoint); err == nil {
			return dropped
		}
	}
	slog.InfoContext(ctx, "push: send failed", "status", status, "err", err, "failures", failures)
	return failed
}

// Run sends the day's push as soon as a new UTC day has started (checking every
// `every`), until ctx is done. Errors are logged and retried on the next tick only if
// the day wasn't claimed yet.
func (s *Service) Run(ctx context.Context, every time.Duration) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		if _, err := s.SendPackReady(ctx); err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "pack ready push failed", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
