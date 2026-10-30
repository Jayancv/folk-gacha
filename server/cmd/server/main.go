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

	"cardgame/server/internal/auth"
	"cardgame/server/internal/collection"
	"cardgame/server/internal/config"
	httpapi "cardgame/server/internal/http"
	"cardgame/server/internal/leaderboard"
	"cardgame/server/internal/merges"
	"cardgame/server/internal/packs"
	"cardgame/server/internal/seasons"
	"cardgame/server/internal/store"
)

const defaultDatabaseURL = "postgres://cardgame:cardgame@localhost:55432/cardgame?sslmode=disable"

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	// Local settings from the repo's .env (real environment variables win).
	envFile, err := config.LoadDotEnv()
	if err != nil {
		return err
	}
	if envFile != "" {
		slog.Info("loaded settings", "file", envFile)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	port := env("PORT", "8081")
	dbURL := env("DATABASE_URL", defaultDatabaseURL)
	origins := strings.Split(env("ALLOWED_ORIGINS", "http://localhost:8080"), ",")

	// APP_ENV=prod in the Docker image; local `go run` defaults to dev.
	appEnv := env("APP_ENV", "dev")
	devLogin := os.Getenv("DEV_LOGIN") == "1"
	if devLogin && appEnv != "dev" {
		return errors.New("DEV_LOGIN=1 is only allowed with APP_ENV=dev (anyone could sign in as anyone)")
	}
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")

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

	authOpts := httpapi.AuthOptions{
		GoogleClientID: googleClientID,
		DevLogin:       devLogin,
		SecureCookies:  appEnv != "dev",
	}
	if googleClientID != "" {
		authOpts.Verifier = auth.NewGoogleVerifier(ctx, googleClientID)
	}
	slog.Info("sign-in", "env", appEnv, "google", googleClientID != "", "devLogin", devLogin)

	api := httpapi.NewServer(pool, httpapi.Services{
		Auth:        auth.NewService(store.New(pool)),
		Packs:       packs.NewService(pool),
		Merges:      merges.NewService(pool),
		Collection:  collection.NewService(pool),
		Leaderboard: leaderboard.NewService(pool),
	}, authOpts)
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           api.Handler(origins),
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Weekly leaderboard seasons: create the current week, freeze ended weeks.
	// Safe if several servers run it. On the way out it is stopped and waited for
	// before the pool closes (defers run last-in first-out), so it never sees a closed pool.
	jobCtx, stopJob := context.WithCancel(ctx)
	jobDone := make(chan struct{})
	go func() {
		defer close(jobDone)
		seasons.NewService(pool).Run(jobCtx, time.Minute)
	}()
	defer func() {
		stopJob()
		<-jobDone
	}()

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
