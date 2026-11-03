package main

import (
	"context"
	"log/slog"
	"time"
)

// waitForDB pings the database until it answers, the timeout passes, or ctx ends
// (Ctrl+C). Postgres refuses connections while it starts or recovers from an unclean
// shutdown (57P03), so the jobs and the listener wait for it instead of logging errors.
// It returns false when the database still isn't up; the server then starts anyway
// (the pool reconnects by itself and /health reports database: down meanwhile).
func waitForDB(ctx context.Context, ping func(context.Context) error, timeout, interval time.Duration) bool {
	start := time.Now()
	deadline := start.Add(timeout)
	logged := false
	for {
		pingCtx, cancel := context.WithTimeout(ctx, interval)
		err := ping(pingCtx)
		cancel()
		if err == nil {
			if logged {
				slog.Info("database ready", "waited", time.Since(start).Round(time.Second))
			}
			return true
		}
		if ctx.Err() != nil {
			return false
		}
		if !logged {
			slog.Info("waiting for database", "err", err, "timeout", timeout)
			logged = true
		}
		if !time.Now().Add(interval).Before(deadline) {
			slog.Warn("database still not reachable, starting anyway", "err", err, "waited", time.Since(start).Round(time.Second))
			return false
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(interval):
		}
	}
}
