// Package dbtest connects integration tests to a real, migrated Postgres.
// Tests using it run only when TEST_DATABASE_URL is set, e.g.
// postgres://cardgame:cardgame@localhost:55432/cardgame_test?sslmode=disable
// (use a separate database: tests wipe the tables they touch).
package dbtest

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"cardgame/server/db"
)

// migrateLock serialises migrations when several test packages start at once.
const migrateLock = 7461_2026

// Pool returns a pool on the migrated test database, or skips the test.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()

	conn, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// One connection for lock + migration + unlock.
	c, err := conn.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if _, err := c.ExecContext(ctx, "SELECT pg_advisory_lock($1)", migrateLock); err != nil {
		t.Fatal(err)
	}
	defer c.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", migrateLock)

	goose.SetBaseFS(db.Migrations)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, conn, "migrations"); err != nil {
		t.Fatalf("migrations: %v", err)
	}

	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
