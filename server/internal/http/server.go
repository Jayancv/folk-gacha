package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"cardgame/server/internal/auth"
)

// Pinger is the slice of the database pool the health check needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Server implements StrictServerInterface.
type Server struct {
	db       Pinger
	auth     *auth.Service
	authOpts AuthOptions
	now      func() time.Time
}

var _ StrictServerInterface = (*Server)(nil)

// NewServer wires the handlers. authSvc may be nil (no database): sign-in is then off.
func NewServer(db Pinger, authSvc *auth.Service, opts AuthOptions) *Server {
	return &Server{db: db, auth: authSvc, authOpts: opts, now: time.Now}
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
