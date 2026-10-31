package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"cardgame/server/internal/game"
	"cardgame/server/internal/packs"
	"cardgame/server/internal/store"
)

func (s *Server) ClaimDailyPack(ctx context.Context, _ ClaimDailyPackRequestObject) (ClaimDailyPackResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return ClaimDailyPack401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.packs == nil {
		return ClaimDailyPack503JSONResponse{Error: "no_season", Message: ptr("Packs aren't available right now.")}, nil
	}
	claim, err := s.packs.ClaimDaily(ctx, user.ID)
	switch {
	case errors.Is(err, packs.ErrAlreadyClaimed):
		return ClaimDailyPack409JSONResponse{Error: "already_claimed", Message: ptr("Today's pack is already open. A new one arrives at 00:00 UTC.")}, nil
	case errors.Is(err, packs.ErrNoSeason):
		return ClaimDailyPack503JSONResponse{Error: "no_season", Message: ptr("Packs aren't available right now.")}, nil
	case err != nil:
		return nil, err
	}
	cards := make([]Card, len(claim.Cards))
	for i, c := range claim.Cards {
		if cards[i], err = toCard(c); err != nil {
			return nil, err
		}
	}
	return ClaimDailyPack200JSONResponse{
		Day:         openapi_types.Date{Time: claim.Day},
		Cards:       cards,
		NextResetAt: claim.NextReset.UTC(),
	}, nil
}

func toCard(c store.GetOwnedCardsRow) (Card, error) {
	card := Card{
		Id:           c.ID,
		SeasonCardId: c.SeasonCardID,
		CardSeasonId: c.CardSeasonID,
		SetNo:        int(c.SetNo),
		SetSize:      int(c.SetSize),
		CopyNo:       int(c.CopyNo),
		TemplateId:   c.TemplateID,
		Name:         c.Name,
		Title:        c.Title,
		Epithet:      c.Epithet,
		NameSi:       c.NameSi,
		Element:      Element(c.Element),
		Rarity:       Rarity(c.Rarity),
		Level:        int(c.Level),
		Score:        game.LevelScore(int(c.Score), int(c.Level)),
		Lore:         c.Lore,
		ArtSeed:      c.ArtSeed,
		AcquiredVia:  CardAcquiredVia(c.AcquiredVia),
		AcquiredAt:   c.AcquiredAt.UTC(),
		InTrade:      c.InTrade,
	}
	if c.MaxCopies.Valid {
		card.MaxCopies = ptr(int(c.MaxCopies.Int32))
	}
	if err := json.Unmarshal(c.Traits, &card.Traits); err != nil {
		return Card{}, fmt.Errorf("card %s traits: %w", c.SeasonCardID, err)
	}
	return card, nil
}

// me is the profile response, with today's pack status when packs are available.
func (s *Server) me(ctx context.Context, u store.User) (Me, error) {
	m := toMe(u)
	if s.packs == nil {
		return m, nil
	}
	st, err := s.packs.Status(ctx, u.ID)
	if err != nil {
		return Me{}, err
	}
	m.DailyPack = &DailyPackStatus{Ready: st.Ready, NextResetAt: st.NextReset.UTC()}
	return m, nil
}
