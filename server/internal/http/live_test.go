package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/auth/authtest"
	"cardgame/server/internal/ws"
)

func TestLiveSocketWithATicket(t *testing.T) {
	hub := ws.NewHub(nil)
	db := authtest.NewMemStore()
	ts := testServer{h: NewServer(fakeDB{}, Services{Auth: auth.NewService(db), Live: hub}, AuthOptions{DevLogin: true}).Handler(nil), db: db}
	srv := httptest.NewServer(ts.h)
	defer srv.Close()

	if rec := ts.do(t, "POST", "/live/ticket", "", nil); rec.Code != 401 {
		t.Fatalf("ticket signed out: %d", rec.Code)
	}
	rec := ts.do(t, "POST", "/auth/dev", `{"name":"asha"}`, nil)
	cookie, me := sessionFrom(t, rec), decode[Me](t, rec)
	rec = ts.do(t, "POST", "/live/ticket", "", cookie)
	if rec.Code != 200 {
		t.Fatalf("ticket: %d %s", rec.Code, rec.Body)
	}
	tk := decode[LiveTicket](t, rec)

	base := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, resp, err := websocket.Dial(ctx, base, nil); err == nil || resp.StatusCode != 401 {
		t.Fatalf("no ticket: %v", err)
	}
	c, _, err := websocket.Dial(ctx, base+"?ticket="+tk.Ticket, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	for hub.Connected(me.Id) == 0 {
		time.Sleep(5 * time.Millisecond)
	}
	hub.Send(me.Id, ws.Event{Type: "trade.received", By: "ben"})
	_, msg, err := c.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var e map[string]any
	if err := json.Unmarshal(msg, &e); err != nil || fmt.Sprint(e) != "map[by:ben type:trade.received]" {
		t.Errorf("event %s (%v)", msg, err)
	}
}
