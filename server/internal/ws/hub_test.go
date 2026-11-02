package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

func serve(t *testing.T, h *Hub) string {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

func dial(t *testing.T, base, ticket string, origin string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	opts := &websocket.DialOptions{}
	if origin != "" {
		opts.HTTPHeader = http.Header{"Origin": {origin}}
	}
	return websocket.Dial(ctx, base+"?ticket="+ticket, opts)
}

func read(t *testing.T, c *websocket.Conn) Event {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, msg, err := c.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var e Event
	if err := json.Unmarshal(msg, &e); err != nil {
		t.Fatal(err)
	}
	return e
}

// waitConnected waits until the hub registered n sockets for the user (Accept returns
// to the client a moment before the server side adds it).
func waitConnected(t *testing.T, h *Hub, user uuid.UUID, n int) {
	t.Helper()
	for deadline := time.Now().Add(5 * time.Second); h.Connected(user) != n; {
		if time.Now().After(deadline) {
			t.Fatalf("connected %d, want %d", h.Connected(user), n)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestEventsReachEverySocketOfThePlayer(t *testing.T) {
	h := NewHub(nil)
	base := serve(t, h)
	asha, ben := uuid.New(), uuid.New()

	var socks []*websocket.Conn
	for range 2 { // two tabs
		tk, _ := h.Ticket(asha)
		c, _, err := dial(t, base, tk, "")
		if err != nil {
			t.Fatal(err)
		}
		defer c.CloseNow()
		socks = append(socks, c)
	}
	waitConnected(t, h, asha, 2)

	trade := uuid.New()
	h.Send(ben, Event{Type: "trade.accepted"}) // nobody connected: dropped
	h.Send(asha, Event{Type: "trade.received", TradeID: trade, By: "ben"})
	for _, c := range socks {
		if e := read(t, c); e.Type != "trade.received" || e.TradeID != trade || e.By != "ben" {
			t.Errorf("event %+v", e)
		}
	}

	socks[0].Close(websocket.StatusNormalClosure, "")
	waitConnected(t, h, asha, 1)
}

func TestTicketsAreSingleUseAndShortLived(t *testing.T) {
	h := NewHub(nil)
	now := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	h.Now = func() time.Time { return now }
	base := serve(t, h)
	user := uuid.New()

	tk, expires := h.Ticket(user)
	if !expires.Equal(now.Add(TicketTTL)) {
		t.Errorf("expires %v", expires)
	}
	c, _, err := dial(t, base, tk, "")
	if err != nil {
		t.Fatal(err)
	}
	c.CloseNow()
	if _, resp, err := dial(t, base, tk, ""); err == nil || resp == nil || resp.StatusCode != 401 {
		t.Errorf("ticket used twice: %v %v", resp, err)
	}
	if _, resp, err := dial(t, base, "made-up", ""); err == nil || resp == nil || resp.StatusCode != 401 {
		t.Errorf("unknown ticket: %v %v", resp, err)
	}
	late, _ := h.Ticket(user)
	now = now.Add(TicketTTL)
	if _, resp, err := dial(t, base, late, ""); err == nil || resp == nil || resp.StatusCode != 401 {
		t.Errorf("expired ticket: %v %v", resp, err)
	}
}

func TestOnlyAllowedOriginsConnect(t *testing.T) {
	h := NewHub(OriginHosts([]string{"https://folk-gacha.netlify.app"}))
	base := serve(t, h)
	user := uuid.New()

	tk, _ := h.Ticket(user)
	if _, resp, err := dial(t, base, tk, "https://evil.example"); err == nil || resp == nil || resp.StatusCode != 403 {
		t.Errorf("foreign origin: %v %v", resp, err)
	}
	tk, _ = h.Ticket(user)
	c, _, err := dial(t, base, tk, "https://folk-gacha.netlify.app")
	if err != nil {
		t.Fatalf("allowed origin: %v", err)
	}
	c.CloseNow()
}

func TestOldestSocketGoesPastTheLimit(t *testing.T) {
	h := NewHub(nil)
	base := serve(t, h)
	user := uuid.New()
	var first *websocket.Conn
	for i := range MaxConnsPerUser + 1 {
		tk, _ := h.Ticket(user)
		c, _, err := dial(t, base, tk, "")
		if err != nil {
			t.Fatal(err)
		}
		defer c.CloseNow()
		if i == 0 {
			first = c
		}
		waitConnected(t, h, user, min(i+1, MaxConnsPerUser))
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, _, err := first.Read(ctx); websocket.CloseStatus(err) != websocket.StatusGoingAway {
		t.Errorf("oldest socket: %v", err)
	}
}

func TestOriginHosts(t *testing.T) {
	got := OriginHosts([]string{"http://localhost:8080", "https://folk-gacha.netlify.app", "*", "::bad"})
	want := []string{"localhost:8080", "folk-gacha.netlify.app", "*"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("hosts %v", got)
	}
}
