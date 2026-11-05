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
		item := openedGift{Card: card}
		if g.Tournament != "" {
			item.Tournament = &giftTournament{Id: g.Tournament, Name: g.TournamentName, Place: g.Place}
		} else {
			item.Partner = ptr(g.Partner)
		}
		out.Gifts = append(out.Gifts, item)
	}
	return out, nil
}

// The generated OpenedGifts item types (anonymous in the spec).
type (
	giftTournament = struct {
		Id    string `json:"id"`
		Name  string `json:"name"`
		Place int    `json:"place"`
	}
	openedGift = struct {
		Card       Card            `json:"card"`
		Partner    *string         `json:"partner,omitempty"`
		Tournament *giftTournament `json:"tournament,omitempty"`
	}
)
