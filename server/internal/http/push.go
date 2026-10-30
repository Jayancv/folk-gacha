package httpapi

import (
	"context"
	"errors"

	"cardgame/server/internal/push"
)

func (s *Server) GetPushKey(context.Context, GetPushKeyRequestObject) (GetPushKeyResponseObject, error) {
	if s.push == nil || s.pushPublicKey == "" {
		return GetPushKey404JSONResponse{Error: "push_disabled"}, nil
	}
	return GetPushKey200JSONResponse{PublicKey: s.pushPublicKey}, nil
}

func (s *Server) SubscribePush(ctx context.Context, req SubscribePushRequestObject) (SubscribePushResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return SubscribePush401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.push == nil {
		return SubscribePush404JSONResponse{Error: "push_disabled"}, nil
	}
	if req.Body == nil {
		return SubscribePush400JSONResponse{Error: "bad_subscription"}, nil
	}
	err := s.push.Subscribe(ctx, user.ID, push.Subscription{
		Endpoint: req.Body.Endpoint, P256dh: req.Body.Keys.P256dh, Auth: req.Body.Keys.Auth,
	})
	if errors.Is(err, push.ErrBadSubscription) {
		return SubscribePush400JSONResponse{Error: "bad_subscription", Message: ptr(err.Error())}, nil
	}
	if err != nil {
		return nil, err
	}
	return SubscribePush204Response{}, nil
}

func (s *Server) UnsubscribePush(ctx context.Context, req UnsubscribePushRequestObject) (UnsubscribePushResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return UnsubscribePush401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.push != nil && req.Body != nil {
		if err := s.push.Unsubscribe(ctx, user.ID, req.Body.Endpoint); err != nil {
			return nil, err
		}
	}
	return UnsubscribePush204Response{}, nil
}
