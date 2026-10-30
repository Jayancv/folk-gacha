package httpapi

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"cardgame/server/internal/leaderboard"
	"cardgame/server/internal/store"
)

// The leaderboard is public; a signed-in viewer also gets their own standing.

func (s *Server) GetCurrentLeaderboard(ctx context.Context, _ GetCurrentLeaderboardRequestObject) (GetCurrentLeaderboardResponseObject, error) {
	if s.leaderboard == nil {
		return nil, errors.New("leaderboard is not configured")
	}
	viewer, user := viewerFrom(ctx)
	b, err := s.leaderboard.Current(ctx, viewer)
	if err != nil {
		return nil, err
	}
	return GetCurrentLeaderboard200JSONResponse(toLeaderboard(b, user)), nil
}

func (s *Server) GetLeaderboard(ctx context.Context, req GetLeaderboardRequestObject) (GetLeaderboardResponseObject, error) {
	if s.leaderboard == nil {
		return nil, errors.New("leaderboard is not configured")
	}
	viewer, user := viewerFrom(ctx)
	b, err := s.leaderboard.Season(ctx, req.SeasonId, viewer)
	if errors.Is(err, leaderboard.ErrNotFound) {
		return GetLeaderboard404JSONResponse{Error: "not_found", Message: ptr("No leaderboard for that week.")}, nil
	}
	if err != nil {
		return nil, err
	}
	return GetLeaderboard200JSONResponse(toLeaderboard(b, user)), nil
}

// viewerFrom is the signed-in user, if any.
func viewerFrom(ctx context.Context) (*uuid.UUID, store.User) {
	user, ok := userFrom(ctx)
	if !ok {
		return nil, store.User{}
	}
	return &user.ID, user
}

func toLeaderboard(b leaderboard.Board, viewer store.User) Leaderboard {
	out := Leaderboard{
		Season:     LeaderboardSeason{Id: b.Season.ID, StartsAt: b.Season.StartsAt.UTC(), EndsAt: b.Season.EndsAt.UTC()},
		Final:      b.Final,
		PreviousId: b.PreviousID,
		Top:        make([]LeaderboardEntry, len(b.Top)),
		Players:    b.Players,
	}
	for i, e := range b.Top {
		out.Top[i] = LeaderboardEntry{Rank: e.Rank, Username: e.Username, Points: e.Points}
	}
	if b.You != nil {
		out.You = &LeaderboardEntry{Rank: b.You.Rank, Username: viewer.Username, Points: b.You.Points}
	}
	return out
}
