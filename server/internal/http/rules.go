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
		PityPacks:           r.Packs.PityPacks,
		DropChancePercent: struct {
			Common    float32 `json:"common"`
			Epic      float32 `json:"epic"`
			Legendary float32 `json:"legendary"`
			Rare      float32 `json:"rare"`
			Uncommon  float32 `json:"uncommon"`
		}{
			Common:    float32(r.Packs.DropChancePercent[game.Common]),
			Uncommon:  float32(r.Packs.DropChancePercent[game.Uncommon]),
			Rare:      float32(r.Packs.DropChancePercent[game.Rare]),
			Epic:      float32(r.Packs.DropChancePercent[game.Epic]),
			Legendary: float32(r.Packs.DropChancePercent[game.Legendary]),
		},
	}, nil
}
