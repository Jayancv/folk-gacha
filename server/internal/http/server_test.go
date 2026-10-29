package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func TestGetHealth(t *testing.T) {
	tests := []struct {
		name       string
		db         Pinger
		wantCode   int
		wantStatus HealthStatus
		wantDB     HealthDatabase
	}{
		{"database up", fakeDB{}, http.StatusOK, HealthStatusOk, HealthDatabaseOk},
		{"database down", fakeDB{err: errors.New("refused")}, http.StatusServiceUnavailable, HealthStatusDegraded, HealthDatabaseDown},
		{"no database", nil, http.StatusServiceUnavailable, HealthStatusDegraded, HealthDatabaseDown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := NewServer(tt.db, nil, AuthOptions{})
			s.now = func() time.Time { return time.Date(2026, 1, 1, 23, 59, 0, 0, time.FixedZone("x", 5*3600)) }

			rec := httptest.NewRecorder()
			s.Handler(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

			if rec.Code != tt.wantCode {
				t.Fatalf("code = %d, want %d", rec.Code, tt.wantCode)
			}
			var got Health
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if got.Status != tt.wantStatus || got.Database != tt.wantDB {
				t.Errorf("got %+v", got)
			}
			if _, off := got.Time.Zone(); off != 0 {
				t.Errorf("time not UTC: %v", got.Time)
			}
		})
	}
}

func TestCORS(t *testing.T) {
	h := NewServer(fakeDB{}, nil, AuthOptions{}).Handler([]string{"https://game.example"})

	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Header.Set("Origin", "https://game.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent || rec.Header().Get("Access-Control-Allow-Origin") != "https://game.example" {
		t.Errorf("allowed origin: code=%d header=%q", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
	}

	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("unknown origin should not get CORS headers")
	}
}
