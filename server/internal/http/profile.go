package httpapi

import (
	"context"
	"errors"

	"cardgame/server/internal/profile"
)

func (s *Server) GetProfile(ctx context.Context, req GetProfileRequestObject) (GetProfileResponseObject, error) {
	viewer, ok := userFrom(ctx)
	if !ok {
		return GetProfile401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.profiles == nil {
		return nil, errors.New("profiles are not configured")
	}
	p, err := s.profiles.Get(ctx, req.Username)
	if errors.Is(err, profile.ErrNotFound) {
		return GetProfile404JSONResponse{Error: "not_found", Message: ptr("No player by that name.")}, nil
	}
	if err != nil {
		return nil, err
	}
	out, err := toProfile(p, viewer.ID == p.User.ID)
	if err != nil {
		return nil, err
	}
	return GetProfile200JSONResponse(out), nil
}

func (s *Server) SetShowcase(ctx context.Context, req SetShowcaseRequestObject) (SetShowcaseResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return SetShowcase401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.profiles == nil {
		return nil, errors.New("profiles are not configured")
	}
	if req.Body == nil {
		return SetShowcase400JSONResponse{Error: "bad_showcase"}, nil
	}
	p, err := s.profiles.SetShowcase(ctx, user, req.Body.CardIds)
	switch {
	case errors.Is(err, profile.ErrBadShowcase):
		return SetShowcase400JSONResponse{Error: "bad_showcase", Message: ptr(err.Error())}, nil
	case errors.Is(err, profile.ErrNotOwned):
		return SetShowcase400JSONResponse{Error: "not_owned", Message: ptr("You don't have one of these cards.")}, nil
	case err != nil:
		return nil, err
	}
	out, err := toProfile(p, true)
	if err != nil {
		return nil, err
	}
	return SetShowcase200JSONResponse(out), nil
}

// toProfile shapes a profile for the API. The full name is personal: only the
// player themself gets it (own is true); everyone else sees the username.
func toProfile(p profile.Profile, own bool) (Profile, error) {
	out := Profile{
		Username:          p.User.Username,
		JoinedAt:          p.User.CreatedAt.UTC(),
		CollectionPower:   p.CollectionPower,
		CardCount:         p.CardCount,
		RecipesDiscovered: p.Recipes,
		Podiums:           p.Podiums,
		Showcase:          make([]Card, len(p.Showcase)),
		ShowcaseChosen:    p.Chosen,
	}
	if own && p.User.DisplayName != "" {
		out.DisplayName = ptr(p.User.DisplayName)
	}
	for i, c := range p.Showcase {
		card, err := toCard(c)
		if err != nil {
			return Profile{}, err
		}
		out.Showcase[i] = card
	}
	return out, nil
}
