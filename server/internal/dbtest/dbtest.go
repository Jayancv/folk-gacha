// Package dbtest connects integration tests to a real, migrated Postgres.
// Tests using it run only when TEST_DATABASE_URL is set, e.g.
// postgres://cardgame:cardgame@localhost:55432/cardgame_test?sslmode=disable
// (use a separate database: tests wipe the tables they touch).
//
// Each test package gets its own database next to it (cardgame_test_packs, …),
// created on first use, because `go test ./...` runs packages in parallel and
// one package's TRUNCATE … CASCADE would wipe another's rows mid-test.
package dbtest

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	dbURL, err := packageDatabase(ctx, base)
	if err != nil {
		t.Fatal(err)
	}

	conn, err := sql.Open("pgx", dbURL)
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

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

var unsafeName = regexp.MustCompile(`[^a-z0-9_]+`)

// packageDatabase returns the URL of this test package's own database (named
// after the test binary, e.g. packs.test -> cardgame_test_packs), creating it if needed.
func packageDatabase(ctx context.Context, base string) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", fmt.Errorf("TEST_DATABASE_URL: %w", err)
	}
	pkg := strings.TrimSuffix(strings.TrimSuffix(filepath.Base(os.Args[0]), ".exe"), ".test")
	name := strings.TrimPrefix(u.Path, "/") + "_" + unsafeName.ReplaceAllString(strings.ToLower(pkg), "_")

	conn, err := sql.Open("pgx", base)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	var exists bool
	if err := conn.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)", name).Scan(&exists); err != nil {
		return "", err
	}
	if !exists {
		// name is [a-z0-9_] only, so it is safe to quote this way.
		if _, err := conn.ExecContext(ctx, `CREATE DATABASE "`+name+`"`); err != nil && !strings.Contains(err.Error(), "already exists") {
			return "", fmt.Errorf("create %s: %w", name, err)
		}
	}
	u.Path = "/" + name
	return u.String(), nil
}
