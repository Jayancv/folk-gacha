package push

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cardgame/server/internal/store"
)

// TradeEvent is a trade change for one player (trades.Event, without importing trades).
type TradeEvent struct {
	To      uuid.UUID
	Type    string // "trade.received", "trade.accepted", ...
	TradeID uuid.UUID
	// By is the other player's username ("" for expiry).
	By string
}

// TradesURL opens the app on the Trades tab (the web app reads ?tab=trades).
const TradesURL = "/?tab=trades"

// TradeMessage is the notification for a trade event, and false for events that don't get
// one: only a new offer and an accepted one are worth a buzz in the player's pocket
// (declines, withdrawals and expiries show in the app). `name` is how to call the other player.
func TradeMessage(eventType, name string, tradeID uuid.UUID) (Message, bool) {
	tag := "trade-" + tradeID.String()
	switch eventType {
	case "trade.received":
		return Message{
			Title: "New trade offer",
			Body:  name + " sent you a trade offer. Tap to see what they want to swap.",
			URL:   TradesURL,
			Tag:   tag,
		}, true
	case "trade.accepted":
		return Message{
			Title: "Trade accepted",
			Body:  name + " accepted your trade. Your new cards are in your collection.",
			URL:   TradesURL,
			Tag:   tag,
		}, true
	}
	return Message{}, false
}

// SendTrade pushes a trade event to the player's devices, if it gets a notification and
// they want trade notifications. Returns how many devices got it. Call it after the
// trade committed, outside any request (it talks to the browsers' push services).
func (s *Service) SendTrade(ctx context.Context, e TradeEvent) (int, error) {
	if _, ok := TradeMessage(e.Type, "", e.TradeID); !ok {
		return 0, nil
	}
	q := store.New(s.pool)
	subs, err := q.ListTradePushSubscriptions(ctx, e.To)
	if err != nil || len(subs) == 0 {
		return 0, err
	}
	name := e.By
	if n, err := q.GetPushName(ctx, e.By); err == nil {
		name = n
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	msg, _ := TradeMessage(e.Type, name, e.TradeID)
	payload, err := json.Marshal(msg)
	if err != nil {
		return 0, err
	}
	sent := 0
	for _, sub := range subs {
		if s.deliver(ctx, q, Subscription{Endpoint: sub.Endpoint, P256dh: sub.P256dh, Auth: sub.Auth}, payload) == delivered {
			sent++
		}
	}
	slog.InfoContext(ctx, "trade push sent", "type", e.Type, "trade", e.TradeID, "devices", sent)
	return sent, nil
}

// SetTradeNotices turns the player's trade notifications on or off (every device).
func (s *Service) SetTradeNotices(ctx context.Context, userID uuid.UUID, on bool) error {
	return store.New(s.pool).SetNotifyTrades(ctx, store.SetNotifyTradesParams{ID: userID, NotifyTrades: on})
}
