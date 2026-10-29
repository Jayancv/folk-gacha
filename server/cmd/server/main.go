package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	httpapi "cardgame/server/internal/http"
)

const defaultDatabaseURL = "postgres://cardgame:cardgame@localhost:55432/cardgame?sslmode=disable"

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	port := env("PORT", "8081")
	dbURL := env("DATABASE_URL", defaultDatabaseURL)
	origins := strings.Split(env("ALLOWED_ORIGINS", "http://localhost:8080"), ",")

	cfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return err
	}
	// Every session runs in UTC so daily resets and seasons line up.
	cfg.ConnConfig.RuntimeParams["timezone"] = "UTC"

	// The pool connects lazily, so the server starts even if Postgres is down;
	// /health then reports database: down.
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.NewServer(pool).Handler(origins),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", "http://localhost:"+port)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
