// Package authtest has in-memory fakes for testing sign-in without Postgres or Google.
package authtest

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/store"
)

// MemStore mimics the users/sessions tables, including Postgres unique-violation
// errors, so the service's retry paths run in tests.
type MemStore struct {
	mu       sync.Mutex
	users    []store.User
	sessions map[string]store.Session
	Now      func() time.Time
	// Fail makes every call return this error (simulates the database being down).
	Fail error
}

var _ auth.Store = (*MemStore)(nil)

func NewMemStore() *MemStore {
	return &MemStore{sessions: map[string]store.Session{}, Now: time.Now}
}

func (m *MemStore) GetUserByAuthID(_ context.Context, authID string) (store.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil {
		return store.User{}, m.Fail
	}
	for _, u := range m.users {
		if u.AuthID == authID {
			return u, nil
		}
	}
	return store.User{}, pgx.ErrNoRows
}

func (m *MemStore) CreateUser(_ context.Context, arg store.CreateUserParams) (store.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil {
		return store.User{}, m.Fail
	}
	for _, u := range m.users {
		if u.AuthID == arg.AuthID {
			return store.User{}, &pgconn.PgError{Code: "23505", ConstraintName: "users_auth_id_key"}
		}
		if strings.EqualFold(u.Username, arg.Username) {
			return store.User{}, &pgconn.PgError{Code: "23505", ConstraintName: "users_username_idx"}
		}
	}
	if !auth.ValidUsername(arg.Username) {
		return store.User{}, &pgconn.PgError{Code: "23514", ConstraintName: "users_username_check"}
	}
	now := m.Now().UTC()
	u := store.User{ID: uuid.New(), AuthID: arg.AuthID, Username: arg.Username, CreatedAt: now, TradeUnlockedAt: now}
	m.users = append(m.users, u)
	return u, nil
}

func (m *MemStore) SetDisplayName(_ context.Context, arg store.SetDisplayNameParams) (store.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil {
		return store.User{}, m.Fail
	}
	for i, u := range m.users {
		if u.ID == arg.ID {
			m.users[i].DisplayName = arg.DisplayName
			return m.users[i], nil
		}
	}
	return store.User{}, pgx.ErrNoRows
}

func (m *MemStore) CompleteTutorial(_ context.Context, id uuid.UUID) (store.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil {
		return store.User{}, m.Fail
	}
	for i, u := range m.users {
		if u.ID == id {
			if !m.users[i].TutorialDoneAt.Valid {
				m.users[i].TutorialDoneAt = pgtype.Timestamptz{Time: m.Now().UTC(), Valid: true}
			}
			return m.users[i], nil
		}
	}
	return store.User{}, pgx.ErrNoRows
}

func (m *MemStore) CreateSession(_ context.Context, arg store.CreateSessionParams) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil {
		return m.Fail
	}
	m.sessions[string(arg.TokenHash)] = store.Session{TokenHash: arg.TokenHash, UserID: arg.UserID, CreatedAt: m.Now(), ExpiresAt: arg.ExpiresAt}
	return nil
}

func (m *MemStore) GetSessionUser(_ context.Context, tokenHash []byte) (store.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil {
		return store.User{}, m.Fail
	}
	s, ok := m.sessions[string(tokenHash)]
	if !ok || !s.ExpiresAt.After(m.Now()) {
		return store.User{}, pgx.ErrNoRows
	}
	for _, u := range m.users {
		if u.ID == s.UserID {
			return u, nil
		}
	}
	return store.User{}, pgx.ErrNoRows
}

func (m *MemStore) DeleteSession(_ context.Context, tokenHash []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Fail != nil {
		return m.Fail
	}
	delete(m.sessions, string(tokenHash))
	return nil
}

// Users returns a copy of all users (for assertions).
func (m *MemStore) Users() []store.User {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]store.User(nil), m.users...)
}

// SessionCount is the number of stored sessions (for assertions).
func (m *MemStore) SessionCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

// FakeGoogle accepts tokens of the form "valid:<sub>:<name>" and rejects the rest.
type FakeGoogle struct{}

func (FakeGoogle) Verify(_ context.Context, credential string) (auth.GoogleIdentity, error) {
	parts := strings.SplitN(credential, ":", 3)
	if len(parts) != 3 || parts[0] != "valid" {
		return auth.GoogleIdentity{}, errors.New("fake google: bad token")
	}
	return auth.GoogleIdentity{Subject: parts[1], Name: parts[2], Email: parts[2] + "@example.com"}, nil
}
