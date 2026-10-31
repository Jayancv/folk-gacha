package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/collection"
	"cardgame/server/internal/leaderboard"
	"cardgame/server/internal/merges"
	"cardgame/server/internal/packs"
	"cardgame/server/internal/profile"
	"cardgame/server/internal/push"
	"cardgame/server/internal/trades"
)

// Pinger is the slice of the database pool the health check needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Server implements StrictServerInterface.
type Server struct {
	db            Pinger
	auth          *auth.Service
	authOpts      AuthOptions
	packs         *packs.Service
	merges        *merges.Service
	collection    *collection.Service
	leaderboard   *leaderboard.Service
	push          *push.Service
	pushPublicKey string
	profiles      *profile.Service
	trades        *trades.Service
	now           func() time.Time
}

var _ StrictServerInterface = (*Server)(nil)

// Services are the game services behind the handlers. Any may be nil (tests
// without a database); its endpoints are then unavailable.
type Services struct {
	Auth        *auth.Service
	Packs       *packs.Service
	Merges      *merges.Service
	Collection  *collection.Service
	Leaderboard *leaderboard.Service
	// Push and PushPublicKey enable notifications (both set, or both empty).
	Push          *push.Service
	PushPublicKey string
	Profiles      *profile.Service
	Trades        *trades.Service
}

// NewServer wires the handlers.
func NewServer(db Pinger, svc Services, opts AuthOptions) *Server {
	return &Server{db: db, auth: svc.Auth, packs: svc.Packs, merges: svc.Merges, collection: svc.Collection, leaderboard: svc.Leaderboard, push: svc.Push, pushPublicKey: svc.PushPublicKey, profiles: svc.Profiles, trades: svc.Trades, authOpts: opts, now: time.Now}
}

// Handler returns the full HTTP handler with middleware applied.
func (s *Server) Handler(allowedOrigins []string) http.Handler {
	h := Handler(NewStrictHandlerWithOptions(s, nil, StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		},
		// Log the detail, but never send internal errors to the client.
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			slog.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "Something went wrong.")
		},
	}))
	return withCORS(allowedOrigins, s.withSession(h))
}

func writeError(w http.ResponseWriter, code int, errCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(Error{Error: errCode, Message: &message})
}

func (s *Server) GetHealth(ctx context.Context, _ GetHealthRequestObject) (GetHealthResponseObject, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	now := s.now().UTC()
	if s.db == nil {
		return GetHealth503JSONResponse{Status: HealthStatusDegraded, Database: HealthDatabaseDown, Time: now}, nil
	}
	if err := s.db.Ping(ctx); err != nil {
		slog.WarnContext(ctx, "health: database ping failed", "err", err)
		return GetHealth503JSONResponse{Status: HealthStatusDegraded, Database: HealthDatabaseDown, Time: now}, nil
	}
	return GetHealth200JSONResponse{Status: HealthStatusOk, Database: HealthDatabaseOk, Time: now}, nil
}
