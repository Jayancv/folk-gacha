package httpapi

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"cardgame/server/internal/game"
	"cardgame/server/internal/trades"
)

func (s *Server) ListTrades(ctx context.Context, _ ListTradesRequestObject) (ListTradesResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return ListTrades401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.trades == nil {
		return ListTrades200JSONResponse{Trades: []Trade{}}, nil
	}
	list, err := s.trades.List(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	out := ListTrades200JSONResponse{Trades: make([]Trade, len(list))}
	for i, t := range list {
		if out.Trades[i], err = toTrade(t, user.ID); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Server) CreateTrade(ctx context.Context, req CreateTradeRequestObject) (CreateTradeResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return CreateTrade401JSONResponse{Error: "not_signed_in"}, nil
	}
	if req.Body == nil {
		return CreateTrade400JSONResponse{Error: "bad_request", Message: ptr("Send who to trade with and the cards.")}, nil
	}
	if s.trades == nil {
		return nil, errors.New("trades are not configured")
	}
	t, err := s.trades.Create(ctx, user.ID, trades.NewOffer{To: req.Body.To, Offer: req.Body.Offer, Request: req.Body.Request})
	switch {
	case errors.Is(err, game.ErrBadOffer):
		return CreateTrade400JSONResponse{Error: "bad_offer", Message: ptr(fmt.Sprintf("Pick 1 to %d different cards on each side.", game.MaxTradeCards))}, nil
	case errors.Is(err, trades.ErrSelf):
		return CreateTrade400JSONResponse{Error: "self_trade", Message: ptr("You can't trade with yourself.")}, nil
	case errors.Is(err, trades.ErrTradeLocked):
		return CreateTrade403JSONResponse{Error: "trade_locked", Message: ptr("Your account can't trade yet.")}, nil
	case errors.Is(err, trades.ErrNoSuchPlayer):
		return CreateTrade404JSONResponse{Error: "not_found", Message: ptr("No player by that name.")}, nil
	case errors.Is(err, trades.ErrRecipientLocked):
		return CreateTrade409JSONResponse{Error: "recipient_locked", Message: ptr("This player can't trade yet.")}, nil
	case errors.Is(err, trades.ErrNotOwned):
		return CreateTrade409JSONResponse{Error: "not_owned", Message: ptr("One of these cards changed hands. Pick again.")}, nil
	case errors.Is(err, trades.ErrInTrade):
		return CreateTrade409JSONResponse{Error: "in_trade", Message: ptr("One of these cards is already in an open offer.")}, nil
	case errors.Is(err, trades.ErrDailyLimit):
		return CreateTrade429JSONResponse{Error: "daily_limit", Message: ptr("You've sent today's offers. More at 00:00 UTC.")}, nil
	case err != nil:
		return nil, err
	}
	out, err := toTrade(t, user.ID)
	if err != nil {
		return nil, err
	}
	return CreateTrade201JSONResponse(out), nil
}

func (s *Server) AcceptTrade(ctx context.Context, req AcceptTradeRequestObject) (AcceptTradeResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return AcceptTrade401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.trades == nil {
		return nil, errors.New("trades are not configured")
	}
	t, err := s.trades.Accept(ctx, user.ID, req.TradeId)
	if code, msg, ok := tradeActionError(err); ok {
		if code == "not_found" {
			return AcceptTrade404JSONResponse{Error: code, Message: ptr(msg)}, nil
		}
		return AcceptTrade409JSONResponse{Error: code, Message: ptr(msg)}, nil
	}
	if err != nil {
		return nil, err
	}
	out, err := toTrade(t, user.ID)
	if err != nil {
		return nil, err
	}
	return AcceptTrade200JSONResponse(out), nil
}

func (s *Server) DeclineTrade(ctx context.Context, req DeclineTradeRequestObject) (DeclineTradeResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return DeclineTrade401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.trades == nil {
		return nil, errors.New("trades are not configured")
	}
	t, err := s.trades.Decline(ctx, user.ID, req.TradeId)
	if code, msg, ok := tradeActionError(err); ok {
		if code == "not_found" {
			return DeclineTrade404JSONResponse{Error: code, Message: ptr(msg)}, nil
		}
		return DeclineTrade409JSONResponse{Error: code, Message: ptr(msg)}, nil
	}
	if err != nil {
		return nil, err
	}
	out, err := toTrade(t, user.ID)
	if err != nil {
		return nil, err
	}
	return DeclineTrade200JSONResponse(out), nil
}

func (s *Server) CancelTrade(ctx context.Context, req CancelTradeRequestObject) (CancelTradeResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return CancelTrade401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.trades == nil {
		return nil, errors.New("trades are not configured")
	}
	t, err := s.trades.Cancel(ctx, user.ID, req.TradeId)
	if code, msg, ok := tradeActionError(err); ok {
		if code == "not_found" {
			return CancelTrade404JSONResponse{Error: code, Message: ptr(msg)}, nil
		}
		return CancelTrade409JSONResponse{Error: code, Message: ptr(msg)}, nil
	}
	if err != nil {
		return nil, err
	}
	out, err := toTrade(t, user.ID)
	if err != nil {
		return nil, err
	}
	return CancelTrade200JSONResponse(out), nil
}

// tradeActionError maps an accept/decline/cancel error to its API code (404 for not_found, 409 otherwise).
func tradeActionError(err error) (code, message string, ok bool) {
	var notOpen *trades.NotOpenError
	switch {
	case errors.Is(err, trades.ErrNotFound):
		return "not_found", "No such offer.", true
	case errors.As(err, &notOpen):
		return "not_open", "This offer was already " + notOpen.Status + ".", true
	case errors.Is(err, trades.ErrExpired):
		return "expired", "This offer expired.", true
	case errors.Is(err, trades.ErrUnavailable):
		return "unavailable", "A card in this offer is no longer available, so the offer failed.", true
	case errors.Is(err, trades.ErrInTrade):
		return "in_trade", "One of your cards in this offer is in another open offer of yours. Cancel that one first.", true
	}
	return "", "", false
}

// toTrade is the API view of an offer for `viewer` (one of its two players).
func toTrade(t trades.Trade, viewer uuid.UUID) (Trade, error) {
	out := Trade{
		Id:         t.ID,
		Direction:  TradeDirection("outgoing"),
		From:       t.From.Username,
		To:         t.To.Username,
		Status:     TradeStatus(t.Status),
		CreatedAt:  t.CreatedAt.UTC(),
		ExpiresAt:  t.ExpiresAt.UTC(),
		Offer:      []TradeItem{},
		Request:    []TradeItem{},
		ResolvedAt: t.ResolvedAt,
		// Only the viewer's own gift: what the other player got is theirs to know.
		Gifted: t.Gifted(viewer),
	}
	if t.To.ID == viewer {
		out.Direction = TradeDirection("incoming")
	}
	if out.ResolvedAt != nil {
		out.ResolvedAt = ptr(out.ResolvedAt.UTC())
	}
	for _, side := range []struct {
		items []trades.Item
		out   *[]TradeItem
	}{{t.Offer, &out.Offer}, {t.Request, &out.Request}} {
		for _, it := range side.items {
			item := TradeItem{CardId: it.CardID}
			if it.Card != nil {
				card, err := toCard(*it.Card)
				if err != nil {
					return Trade{}, err
				}
				item.Card = &card
			}
			*side.out = append(*side.out, item)
		}
	}
	return out, nil
}
