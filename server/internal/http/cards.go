package httpapi

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"cardgame/server/internal/collection"
)

func (s *Server) ListCards(ctx context.Context, req ListCardsRequestObject) (ListCardsResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return ListCards401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.collection == nil {
		return ListCards200JSONResponse{Cards: []Card{}}, nil
	}
	page, bad, err := s.cardPage(ctx, user.ID, req.Params)
	if bad != "" {
		return ListCards400JSONResponse{Error: "bad_filter", Message: ptr(bad)}, nil
	}
	if err != nil {
		return nil, err
	}
	return ListCards200JSONResponse(page), nil
}

// ListPlayerCards lists another player's cards, to pick what to ask for in a trade.
func (s *Server) ListPlayerCards(ctx context.Context, req ListPlayerCardsRequestObject) (ListPlayerCardsResponseObject, error) {
	if _, ok := userFrom(ctx); !ok {
		return ListPlayerCards401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.collection == nil {
		return nil, errors.New("collections are not configured")
	}
	owner, err := s.collection.PlayerID(ctx, req.Username)
	if errors.Is(err, collection.ErrNoSuchPlayer) {
		return ListPlayerCards404JSONResponse{Error: "not_found", Message: ptr("No player by that name.")}, nil
	}
	if err != nil {
		return nil, err
	}
	// Same query parameters as /cards.
	page, bad, err := s.cardPage(ctx, owner, ListCardsParams(req.Params))
	if bad != "" {
		return ListPlayerCards400JSONResponse{Error: "bad_filter", Message: ptr(bad)}, nil
	}
	if err != nil {
		return nil, err
	}
	return ListPlayerCards200JSONResponse(page), nil
}

// cardPage reads one page of an owner's cards. A non-empty `bad` is an invalid filter.
func (s *Server) cardPage(ctx context.Context, owner uuid.UUID, p ListCardsParams) (out CardPage, bad string, err error) {
	f := collection.Filter{
		Spirit: deref(p.Spirit),
		Set:    deref(p.Set),
		Level:  deref(p.Level),
		Limit:  deref(p.Limit),
		Offset: deref(p.Offset),
		Sort:   string(deref(p.Sort)),
	}
	for _, r := range deref(p.Rarity) {
		f.Rarities = append(f.Rarities, string(r))
	}
	for _, e := range deref(p.Element) {
		if !e.Valid() {
			return out, "unknown element " + string(e), nil
		}
		f.Elements = append(f.Elements, string(e))
	}

	page, err := s.collection.List(ctx, owner, f)
	if errors.Is(err, collection.ErrBadFilter) {
		return out, err.Error(), nil
	}
	if err != nil {
		return out, "", err
	}
	out = CardPage{Cards: make([]Card, len(page.Cards)), Total: page.Total}
	for i, c := range page.Cards {
		if out.Cards[i], err = toCard(c); err != nil {
			return out, "", err
		}
	}
	if page.NextOffset >= 0 {
		out.NextOffset = ptr(page.NextOffset)
	}
	return out, "", nil
}

// deref returns *p, or the zero value for nil.
func deref[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}
