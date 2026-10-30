package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/store"
)

const sessionCookie = "fg_session"

// AuthOptions configures sign-in.
type AuthOptions struct {
	// GoogleClientID enables Google sign-in when set (Verifier must be set too).
	GoogleClientID string
	Verifier       auth.GoogleVerifier
	// DevLogin enables POST /auth/dev. Never in production.
	DevLogin bool
	// SecureCookies sets the Secure flag (HTTPS only). Off for local http.
	SecureCookies bool
}

type ctxKey int

const (
	ctxUser ctxKey = iota
	ctxToken
)

// withSession resolves the session cookie (if any) to a user for the handlers.
// It never rejects a request; handlers that need a user return 401 themselves.
func (s *Server) withSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookie)
		if err != nil || s.auth == nil {
			next.ServeHTTP(w, r)
			return
		}
		ctx := context.WithValue(r.Context(), ctxToken, c.Value)
		user, err := s.auth.UserForToken(ctx, c.Value)
		switch {
		case err == nil:
			ctx = context.WithValue(ctx, ctxUser, user)
		case !errors.Is(err, auth.ErrNoSession):
			slog.ErrorContext(ctx, "session lookup failed", "err", err)
			writeError(w, http.StatusServiceUnavailable, "unavailable", "Try again in a moment.")
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func userFrom(ctx context.Context) (store.User, bool) {
	u, ok := ctx.Value(ctxUser).(store.User)
	return u, ok
}

func tokenFrom(ctx context.Context) string {
	t, _ := ctx.Value(ctxToken).(string)
	return t
}

func (s *Server) sessionCookie(token string, expires time.Time) string {
	c := &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: true,
		Secure:   s.authOpts.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	}
	if token == "" {
		c.MaxAge = -1
		c.Expires = time.Unix(0, 0)
	}
	return c.String()
}

func toMe(u store.User) Me {
	return Me{Id: u.ID, Username: u.Username, CreatedAt: u.CreatedAt.UTC(), TradeUnlockedAt: u.TradeUnlockedAt.UTC()}
}

func (s *Server) GetAuthConfig(context.Context, GetAuthConfigRequestObject) (GetAuthConfigResponseObject, error) {
	cfg := AuthConfig{DevLogin: s.authOpts.DevLogin && s.auth != nil}
	if s.googleEnabled() {
		id := s.authOpts.GoogleClientID
		cfg.GoogleClientId = &id
	}
	return GetAuthConfig200JSONResponse(cfg), nil
}

func (s *Server) googleEnabled() bool {
	return s.auth != nil && s.authOpts.GoogleClientID != "" && s.authOpts.Verifier != nil
}

func (s *Server) SignInWithGoogle(ctx context.Context, req SignInWithGoogleRequestObject) (SignInWithGoogleResponseObject, error) {
	if !s.googleEnabled() {
		return SignInWithGoogle404JSONResponse{Error: "google_disabled"}, nil
	}
	if req.Body == nil || req.Body.Credential == "" {
		return SignInWithGoogle401JSONResponse{Error: "invalid_token"}, nil
	}
	id, err := s.authOpts.Verifier.Verify(ctx, req.Body.Credential)
	if err != nil {
		slog.InfoContext(ctx, "google sign-in rejected", "err", err)
		return SignInWithGoogle401JSONResponse{Error: "invalid_token"}, nil
	}
	hint := id.Name
	if hint == "" {
		hint = id.Email
	}
	sess, err := s.auth.SignIn(ctx, "google:"+id.Subject, hint)
	if err != nil {
		return nil, err
	}
	me, err := s.me(ctx, sess.User)
	if err != nil {
		return nil, err
	}
	cookie := s.sessionCookie(sess.Token, sess.ExpiresAt)
	return SignInWithGoogle200JSONResponse{Body: me, Headers: SignInWithGoogle200ResponseHeaders{SetCookie: &cookie}}, nil
}

func (s *Server) SignInDev(ctx context.Context, req SignInDevRequestObject) (SignInDevResponseObject, error) {
	if !s.authOpts.DevLogin || s.auth == nil {
		return SignInDev404JSONResponse{Error: "dev_login_disabled"}, nil
	}
	if req.Body == nil {
		return SignInDev400JSONResponse{Error: "bad_name"}, nil
	}
	// The dev name is the identity: "Asha" and "asha" are the same test player.
	name := auth.SanitizeUsername(req.Body.Name)
	if !auth.ValidUsername(name) {
		return SignInDev400JSONResponse{Error: "bad_name", Message: ptr("Use 3+ letters or digits, e.g. asha or tester2.")}, nil
	}
	sess, err := s.auth.SignIn(ctx, "dev:"+name, name)
	if err != nil {
		return nil, err
	}
	me, err := s.me(ctx, sess.User)
	if err != nil {
		return nil, err
	}
	cookie := s.sessionCookie(sess.Token, sess.ExpiresAt)
	return SignInDev200JSONResponse{Body: me, Headers: SignInDev200ResponseHeaders{SetCookie: &cookie}}, nil
}

func (s *Server) Logout(ctx context.Context, _ LogoutRequestObject) (LogoutResponseObject, error) {
	if s.auth != nil {
		if err := s.auth.SignOut(ctx, tokenFrom(ctx)); err != nil {
			return nil, err
		}
	}
	cookie := s.sessionCookie("", time.Time{})
	return Logout204Response{Headers: Logout204ResponseHeaders{SetCookie: &cookie}}, nil
}

func (s *Server) GetMe(ctx context.Context, _ GetMeRequestObject) (GetMeResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return GetMe401JSONResponse{Error: "not_signed_in"}, nil
	}
	me, err := s.me(ctx, user)
	if err != nil {
		return nil, err
	}
	return GetMe200JSONResponse(me), nil
}

func ptr[T any](v T) *T { return &v }
