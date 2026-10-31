package httpapi

import (
	"context"
	"errors"

	"cardgame/server/internal/mint"
	"cardgame/server/internal/trades"
)

func (s *Server) OpenGifts(ctx context.Context, _ OpenGiftsRequestObject) (OpenGiftsResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return OpenGifts401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.trades == nil {
		return OpenGifts404JSONResponse{Error: "no_gifts", Message: ptr("No gifts waiting.")}, nil
	}
	opened, err := s.trades.OpenGifts(ctx, user.ID)
	switch {
	case errors.Is(err, trades.ErrNoGifts):
		return OpenGifts404JSONResponse{Error: "no_gifts", Message: ptr("No gifts waiting.")}, nil
	case errors.Is(err, trades.ErrNoSeason):
		return OpenGifts503JSONResponse{Error: "no_season", Message: ptr("No card season is open right now.")}, nil
	case errors.Is(err, mint.ErrSoldOut):
		return OpenGifts409JSONResponse{Error: "sold_out", Message: ptr("No gift cards are left this season.")}, nil
	case err != nil:
		return nil, err
	}
	waiting, err := s.trades.WaitingGifts(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	out := OpenGifts200JSONResponse{GiftsWaiting: waiting}
	for _, g := range opened {
		card, err := toCard(g.Card)
		if err != nil {
			return nil, err
		}
		out.Gifts = append(out.Gifts, struct {
			Card    Card   `json:"card"`
			Partner string `json:"partner"`
		}{Card: card, Partner: g.Partner})
	}
	return out, nil
}
