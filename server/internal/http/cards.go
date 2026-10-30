package httpapi

import (
	"context"
	"errors"

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
	p := req.Params
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
			return ListCards400JSONResponse{Error: "bad_filter", Message: ptr("unknown element " + string(e))}, nil
		}
		f.Elements = append(f.Elements, string(e))
	}

	page, err := s.collection.List(ctx, user.ID, f)
	if errors.Is(err, collection.ErrBadFilter) {
		return ListCards400JSONResponse{Error: "bad_filter", Message: ptr(err.Error())}, nil
	}
	if err != nil {
		return nil, err
	}
	out := ListCards200JSONResponse{Cards: make([]Card, len(page.Cards)), Total: page.Total}
	for i, c := range page.Cards {
		if out.Cards[i], err = toCard(c); err != nil {
			return nil, err
		}
	}
	if page.NextOffset >= 0 {
		out.NextOffset = ptr(page.NextOffset)
	}
	return out, nil
}

// deref returns *p, or the zero value for nil.
func deref[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}
