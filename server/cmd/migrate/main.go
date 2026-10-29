// Command migrate applies the goose migrations in db/migrations.
//
//	go run ./cmd/migrate up        apply all pending migrations
//	go run ./cmd/migrate status    list applied and pending migrations
//	go run ./cmd/migrate down      roll back the latest migration
//
// Uses DATABASE_URL from the environment or the repo's .env (default: local Docker Postgres).
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"cardgame/server/db"
	"cardgame/server/internal/config"
)

const defaultDatabaseURL = "postgres://cardgame:cardgame@localhost:55432/cardgame?sslmode=disable"

func main() {
	if err := run(); err != nil {
		slog.Error("migrate failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	if _, err := config.LoadDotEnv(); err != nil {
		return err
	}
	command := "up"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = defaultDatabaseURL
	}

	conn, err := sql.Open("pgx", dbURL)
	if err != nil {
		return err
	}
	defer conn.Close()

	goose.SetBaseFS(db.Migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	ctx := context.Background()
	switch command {
	case "up":
		return goose.UpContext(ctx, conn, "migrations")
	case "down":
		return goose.DownContext(ctx, conn, "migrations")
	case "status":
		return goose.StatusContext(ctx, conn, "migrations")
	default:
		return fmt.Errorf("unknown command %q (use up, down or status)", command)
	}
}
