package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

// Pinger is the slice of the database pool the health check needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Server implements StrictServerInterface.
type Server struct {
	db  Pinger
	now func() time.Time
}

var _ StrictServerInterface = (*Server)(nil)

func NewServer(db Pinger) *Server {
	return &Server{db: db, now: time.Now}
}

// Handler returns the full HTTP handler with middleware applied.
func (s *Server) Handler(allowedOrigins []string) http.Handler {
	h := Handler(NewStrictHandler(s, nil))
	return withCORS(allowedOrigins, h)
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
