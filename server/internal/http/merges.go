package httpapi

import (
	"context"
	"errors"

	"cardgame/server/internal/game"
	"cardgame/server/internal/merges"
)

func (s *Server) MergeCards(ctx context.Context, req MergeCardsRequestObject) (MergeCardsResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return MergeCards401JSONResponse{Error: "not_signed_in"}, nil
	}
	if req.Body == nil || len(req.Body.CardIds) != 2 {
		return MergeCards400JSONResponse{Error: "bad_request", Message: ptr("Send two card ids.")}, nil
	}
	if s.merges == nil {
		return nil, errors.New("merges are not configured")
	}
	res, err := s.merges.Merge(ctx, user.ID, req.Body.CardIds[0], req.Body.CardIds[1])
	switch {
	case errors.Is(err, merges.ErrSameCard):
		return MergeCards400JSONResponse{Error: "same_card", Message: ptr("A card can't merge with itself.")}, nil
	case errors.Is(err, merges.ErrNotOwned):
		return MergeCards404JSONResponse{Error: "not_owned", Message: ptr("You don't have one of these cards.")}, nil
	case errors.Is(err, game.ErrNoRecipe):
		return MergeCards409JSONResponse{Error: "no_recipe", Message: ptr("These cards don't merge.")}, nil
	case errors.Is(err, game.ErrMaxLevel):
		return MergeCards409JSONResponse{Error: "max_level", Message: ptr("These cards are already at the highest level.")}, nil
	case errors.Is(err, merges.ErrSoldOut):
		return MergeCards409JSONResponse{Error: "sold_out", Message: ptr("This spirit has no copies left this season.")}, nil
	case err != nil:
		return nil, err
	}
	card, err := toCard(res.Card)
	if err != nil {
		return nil, err
	}
	return MergeCards200JSONResponse{Kind: MergeResultKind(res.Kind), Card: card, Discovered: res.Discovered}, nil
}

func (s *Server) ListRecipes(ctx context.Context, _ ListRecipesRequestObject) (ListRecipesResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return ListRecipes401JSONResponse{Error: "not_signed_in"}, nil
	}
	recipes := []DiscoveredRecipe{}
	if s.merges == nil {
		return ListRecipes200JSONResponse{Recipes: recipes}, nil
	}
	rows, err := s.merges.Discovered(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		recipes = append(recipes, DiscoveredRecipe{
			Inputs:       []string{r.InputA, r.InputB},
			Output:       r.OutputTemplateID,
			DiscoveredAt: r.DiscoveredAt.UTC(),
		})
	}
	return ListRecipes200JSONResponse{Recipes: recipes}, nil
}
