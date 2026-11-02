package httpapi

import (
	"context"
	"errors"
)

func (s *Server) GetLiveTicket(ctx context.Context, _ GetLiveTicketRequestObject) (GetLiveTicketResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return GetLiveTicket401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.live == nil {
		return nil, errors.New("live events are not configured")
	}
	ticket, expires := s.live.Ticket(user.ID)
	return GetLiveTicket200JSONResponse{Ticket: ticket, ExpiresAt: expires.UTC()}, nil
}
