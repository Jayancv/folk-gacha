package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

var errStarting = errors.New("FATAL: the database system is starting up (SQLSTATE 57P03)")

func TestWaitForDBReadyAtOnce(t *testing.T) {
	calls := 0
	ok := waitForDB(context.Background(), func(context.Context) error { calls++; return nil }, time.Second, 10*time.Millisecond)
	if !ok || calls != 1 {
		t.Fatalf("ok=%v calls=%d, want true 1", ok, calls)
	}
}

func TestWaitForDBRetriesUntilReady(t *testing.T) {
	calls := 0
	ping := func(context.Context) error {
		calls++
		if calls < 3 {
			return errStarting
		}
		return nil
	}
	if !waitForDB(context.Background(), ping, time.Second, 5*time.Millisecond) {
		t.Fatal("want ready")
	}
	if calls != 3 {
		t.Fatalf("calls=%d, want 3", calls)
	}
}

func TestWaitForDBGivesUpAfterTimeout(t *testing.T) {
	start := time.Now()
	ok := waitForDB(context.Background(), func(context.Context) error { return errStarting }, 50*time.Millisecond, 10*time.Millisecond)
	if ok {
		t.Fatal("want not ready")
	}
	if d := time.Since(start); d > 500*time.Millisecond {
		t.Fatalf("took %v, want about the timeout", d)
	}
}

func TestWaitForDBStopsOnCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	ping := func(context.Context) error {
		calls++
		cancel() // Ctrl+C while waiting
		return errStarting
	}
	start := time.Now()
	if waitForDB(ctx, ping, time.Minute, time.Second) {
		t.Fatal("want not ready")
	}
	if calls != 1 || time.Since(start) > 500*time.Millisecond {
		t.Fatalf("calls=%d after %v, want 1 and a quick return", calls, time.Since(start))
	}
}
