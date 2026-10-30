// Command seed loads reference data into the database: the card catalog of every
// season in seasons/*/seed.sql and the recipes in seed/recipes.json. Run it after
// `migrate up`; running it again is safe.
//
//	go run ./cmd/seed
//
// Uses DATABASE_URL from the environment or the repo's .env (default: local Docker Postgres).
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/config"
	"cardgame/server/internal/seeding"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

const defaultDatabaseURL = "postgres://cardgame:cardgame@localhost:55432/cardgame?sslmode=disable"

func main() {
	if err := run(); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	if _, err := config.LoadDotEnv(); err != nil {
		return err
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = defaultDatabaseURL
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	res, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON})
	if err != nil {
		return err
	}
	for id, n := range res.Seasons {
		slog.Info("season loaded", "season", id, "cards", n)
	}
	slog.Info("recipes loaded", "count", res.Recipes)
	return nil
}
