// Package ws pushes live events to signed-in players over WebSockets (GET /ws).
//
// A player first gets a ticket over the normal API (POST /live/ticket, cookie auth),
// then opens the socket with it: the socket may go straight to the API server, where
// the session cookie (first-party to the web app) isn't sent. Tickets are single-use
// and short-lived. Events only say what changed; clients refetch what they show.
//
// The hub lives in one server process: with several servers, events would need to
// go through Postgres LISTEN/NOTIFY. Clients also refetch on (re)connect, so a missed
// event is never more than stale until the next connect or poll.
package ws

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

const (
	// TicketTTL is how long a ticket can be used to connect.
	TicketTTL = time.Minute
	// MaxConnsPerUser bounds sockets per player (tabs and devices); the oldest goes first.
	MaxConnsPerUser = 5
	// sendBuffer is how many events can wait for a slow client before it is dropped
	// (it reconnects and refetches).
	sendBuffer = 16
	pingEvery  = 25 * time.Second
	writeWait  = 10 * time.Second
)

// Event is one message to a player.
type Event struct {
	// Type: trade.received, trade.accepted, trade.declined, trade.cancelled, trade.expired, trade.failed.
	Type    string    `json:"type"`
	TradeID uuid.UUID `json:"tradeId,omitzero"`
	// By is the other player's username (who sent, accepted, … the offer).
	By string `json:"by,omitempty"`
}

type ticket struct {
	user    uuid.UUID
	expires time.Time
}

type conn struct {
	send   chan Event
	cancel context.CancelFunc
}

// Hub holds the open sockets by player.
type Hub struct {
	// OriginPatterns are the hosts browsers may connect from (see websocket.AcceptOptions).
	OriginPatterns []string
	// Now is replaceable in tests (ticket expiry).
	Now func() time.Time

	mu      sync.Mutex
	conns   map[uuid.UUID][]*conn
	tickets map[string]ticket
}

func NewHub(originPatterns []string) *Hub {
	return &Hub{OriginPatterns: originPatterns, Now: time.Now, conns: map[uuid.UUID][]*conn{}, tickets: map[string]ticket{}}
}

// Ticket issues a single-use ticket for `user` to open a socket with.
func (h *Hub) Ticket(user uuid.UUID) (string, time.Time) {
	b := make([]byte, 24)
	_, _ = rand.Read(b) // never fails (crypto/rand)
	id := base64.RawURLEncoding.EncodeToString(b)
	now := h.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	for k, t := range h.tickets { // drop expired ones (there are few)
		if !now.Before(t.expires) {
			delete(h.tickets, k)
		}
	}
	t := ticket{user: user, expires: now.Add(TicketTTL)}
	h.tickets[id] = t
	return id, t.expires
}

// redeem uses up a ticket.
func (h *Hub) redeem(id string) (uuid.UUID, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	t, ok := h.tickets[id]
	delete(h.tickets, id)
	if !ok || !h.Now().Before(t.expires) {
		return uuid.Nil, false
	}
	return t.user, true
}

// Send queues an event for every socket of `user`. It never blocks: a client too
// slow to keep up is disconnected (it refetches when it reconnects).
func (h *Hub) Send(user uuid.UUID, e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.conns[user] {
		select {
		case c.send <- e:
		default:
			c.cancel()
		}
	}
}

// Connected is how many sockets `user` has open.
func (h *Hub) Connected(user uuid.UUID) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.conns[user])
}

func (h *Hub) add(user uuid.UUID, c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := append(h.conns[user], c)
	if len(list) > MaxConnsPerUser {
		list[0].cancel()
		list = list[1:]
	}
	h.conns[user] = list
}

func (h *Hub) remove(user uuid.UUID, c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := h.conns[user]
	for i, x := range list {
		if x == c {
			list = append(list[:i:i], list[i+1:]...)
			break
		}
	}
	if len(list) == 0 {
		delete(h.conns, user)
	} else {
		h.conns[user] = list
	}
}

// ServeHTTP upgrades GET /ws?ticket=… and sends the player's events until either side closes.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	user, ok := h.redeem(r.URL.Query().Get("ticket"))
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"bad_ticket","message":"Get a new ticket from POST /live/ticket."}`))
		return
	}
	sock, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: h.OriginPatterns})
	if err != nil {
		return // Accept already answered (e.g. 403 for a foreign origin)
	}
	// Clients send nothing; reading only handles pongs and the close frame. ctx ends
	// when the client goes away; dropped ends when the hub lets this socket go.
	ctx := sock.CloseRead(r.Context())
	dropped, drop := context.WithCancel(context.Background())
	defer drop()

	c := &conn{send: make(chan Event, sendBuffer), cancel: drop}
	h.add(user, c)
	defer h.remove(user, c)

	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			sock.CloseNow()
			return
		case <-dropped.Done():
			_ = sock.Close(websocket.StatusGoingAway, "")
			return
		case e := <-c.send:
			msg, _ := json.Marshal(e)
			wctx, done := context.WithTimeout(ctx, writeWait)
			err := sock.Write(wctx, websocket.MessageText, msg)
			done()
			if err != nil {
				return
			}
		case <-ping.C:
			// Keeps proxies from closing an idle socket, and finds dead ones.
			pctx, done := context.WithTimeout(ctx, writeWait)
			err := sock.Ping(pctx)
			done()
			if err != nil {
				slog.DebugContext(ctx, "ws ping failed", "err", err)
				return
			}
		}
	}
}

// OriginHosts turns allowed origins ("https://folk-gacha.netlify.app", "*") into the
// host patterns websocket.AcceptOptions wants. Unparseable entries are skipped.
func OriginHosts(origins []string) []string {
	var out []string
	for _, o := range origins {
		if o == "*" {
			out = append(out, "*")
			continue
		}
		if u, err := url.Parse(o); err == nil && u.Host != "" {
			out = append(out, u.Host)
		}
	}
	return out
}
