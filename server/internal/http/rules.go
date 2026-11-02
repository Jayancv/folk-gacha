package httpapi

import (
	"context"

	"cardgame/server/internal/game"
)

func (s *Server) GetRules(context.Context, GetRulesRequestObject) (GetRulesResponseObject, error) {
	r := game.CurrentRules()
	return GetRules200JSONResponse{
		MaxTradeCards:       r.Trading.MaxCardsPerSide,
		DailyOfferLimit:     r.Trading.DailyOfferLimit,
		OfferExpiryHours:    r.Trading.OfferExpiryHours,
		NewAccountWaitDays:  r.Trading.NewAccountWaitDays,
		PartnerGiftsPerWeek: r.PartnerGifts.PerWeek,
	}, nil
}
