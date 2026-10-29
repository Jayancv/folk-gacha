package auth

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"cardgame/server/internal/store"
)

// SessionTTL is how long a sign-in lasts before the player must sign in again.
const SessionTTL = 30 * 24 * time.Hour

var ErrNoSession = errors.New("auth: no valid session")

// Store is the slice of the database auth needs (*store.Queries implements it).
type Store interface {
	GetUserByAuthID(ctx context.Context, authID string) (store.User, error)
	CreateUser(ctx context.Context, arg store.CreateUserParams) (store.User, error)
	CreateSession(ctx context.Context, arg store.CreateSessionParams) error
	GetSessionUser(ctx context.Context, tokenHash []byte) (store.User, error)
	DeleteSession(ctx context.Context, tokenHash []byte) error
}

type Service struct {
	store Store
	now   func() time.Time
	rng   *rand.Rand
}

func NewService(s Store) *Service {
	return &Service{store: s, now: time.Now, rng: rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64()))}
}

// Session is a freshly issued sign-in: the token goes in the cookie.
type Session struct {
	User      store.User
	Token     string
	ExpiresAt time.Time
}

// SignIn finds or creates the user for authID ("google:<sub>", "dev:<name>") and
// starts a session. nameHint seeds the username of a new account.
func (s *Service) SignIn(ctx context.Context, authID, nameHint string) (Session, error) {
	user, err := s.findOrCreate(ctx, authID, nameHint)
	if err != nil {
		return Session{}, err
	}
	token := NewToken()
	expires := s.now().UTC().Add(SessionTTL)
	if err := s.store.CreateSession(ctx, store.CreateSessionParams{TokenHash: HashToken(token), UserID: user.ID, ExpiresAt: expires}); err != nil {
		return Session{}, fmt.Errorf("auth: create session: %w", err)
	}
	return Session{User: user, Token: token, ExpiresAt: expires}, nil
}

func (s *Service) findOrCreate(ctx context.Context, authID, nameHint string) (store.User, error) {
	user, err := s.store.GetUserByAuthID(ctx, authID)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return store.User{}, fmt.Errorf("auth: find user: %w", err)
	}

	for _, name := range UsernameCandidates(BaseUsername(nameHint), 8, s.rng) {
		user, err = s.store.CreateUser(ctx, store.CreateUserParams{AuthID: authID, Username: name})
		if err == nil {
			return user, nil
		}
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			return store.User{}, fmt.Errorf("auth: create user: %w", err)
		}
		if pgErr.ConstraintName == "users_auth_id_key" {
			// Two first sign-ins raced (e.g. double tap); the other one created the account.
			return s.store.GetUserByAuthID(ctx, authID)
		}
		// Username taken: try the next candidate.
	}
	return store.User{}, errors.New("auth: no free username")
}

// UserForToken returns the user behind a session cookie value.
func (s *Service) UserForToken(ctx context.Context, token string) (store.User, error) {
	if token == "" {
		return store.User{}, ErrNoSession
	}
	user, err := s.store.GetSessionUser(ctx, HashToken(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return store.User{}, ErrNoSession
	}
	if err != nil {
		return store.User{}, fmt.Errorf("auth: session lookup: %w", err)
	}
	return user, nil
}

// SignOut ends the session (no error if it's already gone).
func (s *Service) SignOut(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return s.store.DeleteSession(ctx, HashToken(token))
}
