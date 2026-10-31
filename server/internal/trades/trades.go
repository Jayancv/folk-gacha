// Package trades runs card trades between players. Every action is one database
// transaction with row locks: creating an offer locks the offered cards in it,
// accepting swaps all cards at once (or fails the offer if a card is gone), and
// declining, cancelling or expiring unlocks them. The first accepted trade between
// two players also gives each of them a gift, opened on the Pack tab (gifts.go).
// Rules live in internal/game.
package trades

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/mint"
	"cardgame/server/internal/store"
)

var (
	// ErrNotFound: no such offer, or not one this player can act on (they look the same).
	ErrNotFound = errors.New("trades: offer not found")
	// ErrNoSuchPlayer: the recipient username doesn't exist.
	ErrNoSuchPlayer = errors.New("trades: no such player")
	// ErrSelf: players can't trade with themselves.
	ErrSelf = errors.New("trades: can't trade with yourself")
	// ErrTradeLocked: the player's account can't trade yet (game.CanTrade; no wait by default).
	ErrTradeLocked = errors.New("trades: your account can't trade yet")
	// ErrRecipientLocked: the other player's account is too new to trade.
	ErrRecipientLocked = errors.New("trades: that player can't trade yet")
	// ErrDailyLimit: the player sent game.DailyTradeLimit offers today (UTC).
	ErrDailyLimit = errors.New("trades: daily offer limit reached")
	// ErrNotOwned: an offered card isn't the sender's, or a requested card isn't the recipient's.
	ErrNotOwned = errors.New("trades: card not owned")
	// ErrInTrade: a card is already locked in another open offer.
	ErrInTrade = errors.New("trades: card is in another open offer")
	// ErrExpired: the offer ran out of time before it was accepted.
	ErrExpired = errors.New("trades: offer expired")
	// ErrUnavailable: a card of the offer was gone at accept, so the offer failed.
	ErrUnavailable = errors.New("trades: a card is no longer available")
)

// NotOpenError: the offer was already accepted, declined, cancelled, expired or failed.
type NotOpenError struct{ Status string }

func (e *NotOpenError) Error() string { return "trades: offer is " + e.Status }

// game.ErrBadOffer (wrapped) is returned for invalid card lists.

// Statuses of an offer.
const (
	StatusOpen      = "open"
	StatusAccepted  = "accepted"
	StatusDeclined  = "declined"
	StatusCancelled = "cancelled"
	StatusExpired   = "expired"
	StatusFailed    = "failed"
)

// Sides of an offer's cards.
const (
	SideOffer   = "offer"   // the sender gives these
	SideRequest = "request" // the sender asks for these
)

// Service runs trades.
type Service struct {
	pool *pgxpool.Pool
	// Now is replaceable in tests (expiry and the daily limit depend on it).
	Now func() time.Time
	// Rand picks partner gifts; replaceable in tests.
	Rand game.Rand
	// OnEvent, if set, is told about every change to an offer after it is committed
	// (cmd/server sends them to the players' sockets). It must not block.
	OnEvent func(Event)
}

// Event tells a player that one of their offers changed.
type Event struct {
	To      uuid.UUID
	Type    string // EventReceived, or "trade." + the new status
	TradeID uuid.UUID
	By      string // the other player's username; empty for expiry
}

// EventReceived: a new offer was sent to the player.
const EventReceived = "trade.received"

func (s *Service) emit(e Event) {
	if s.OnEvent != nil {
		s.OnEvent(e)
	}
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, Now: time.Now, Rand: mint.GlobalRand{}}
}

// Player is one side of an offer.
type Player struct {
	ID       uuid.UUID
	Username string
}

// Item is one card of an offer. Card is nil when the card no longer exists
// (a requested card merged away, or a card merged after the trade).
type Item struct {
	CardID uuid.UUID
	Card   *store.GetOwnedCardsRow
}

// Trade is an offer with its cards.
type Trade struct {
	ID         uuid.UUID
	From, To   Player
	Status     string
	CreatedAt  time.Time
	ExpiresAt  time.Time
	ResolvedAt *time.Time
	// Offer: what From gives. Request: what From asks for (To's cards).
	Offer, Request []Item
	// GiftedTo: players this trade gave a partner gift (0 to 2; see OpenGifts).
	GiftedTo []uuid.UUID
}

// Gifted reports whether `user` got a partner gift for this trade.
func (t Trade) Gifted(user uuid.UUID) bool {
	return slices.Contains(t.GiftedTo, user)
}

// NewOffer is an offer to make.
type NewOffer struct {
	To      string // recipient username (case-insensitive)
	Offer   []uuid.UUID
	Request []uuid.UUID
}

// Create sends an offer: the offered cards are locked in it until it is resolved.
func (s *Service) Create(ctx context.Context, from uuid.UUID, o NewOffer) (Trade, error) {
	if err := game.CheckOffer(o.Offer, o.Request); err != nil {
		return Trade{}, err
	}
	now := s.Now()
	var id uuid.UUID
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		var err error
		id, err = createTx(ctx, q, from, o, now)
		return err
	})
	if err != nil {
		return Trade{}, err
	}
	t, err := s.get(ctx, store.New(s.pool), id)
	if err == nil {
		s.emit(Event{To: t.To.ID, Type: EventReceived, TradeID: t.ID, By: t.From.Username})
	}
	return t, err
}

func createTx(ctx context.Context, q *store.Queries, from uuid.UUID, o NewOffer, now time.Time) (uuid.UUID, error) {
	to, err := q.GetUserByUsername(ctx, o.To)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNoSuchPlayer
	}
	if err != nil {
		return uuid.Nil, err
	}
	if to.ID == from {
		return uuid.Nil, ErrSelf
	}
	// The sender's row lock makes the daily count exact even for offers sent at once.
	sender, err := q.LockTrader(ctx, from)
	if err != nil {
		return uuid.Nil, err
	}
	if !game.CanTrade(sender.CreatedAt, now) {
		return uuid.Nil, ErrTradeLocked
	}
	if !game.CanTrade(to.CreatedAt, now) {
		return uuid.Nil, ErrRecipientLocked
	}
	sent, err := q.CountTradesSince(ctx, store.CountTradesSinceParams{FromUser: from, Since: game.TradeDay(now)})
	if err != nil {
		return uuid.Nil, err
	}
	if sent >= int64(game.DailyTradeLimit) {
		return uuid.Nil, ErrDailyLimit
	}

	cards, err := q.LockTradeCards(ctx, append(append([]uuid.UUID(nil), o.Offer...), o.Request...))
	if err != nil {
		return uuid.Nil, err
	}
	byID := make(map[uuid.UUID]store.LockTradeCardsRow, len(cards))
	for _, c := range cards {
		byID[c.ID] = c
	}
	for side, owner := range map[*[]uuid.UUID]uuid.UUID{&o.Offer: from, &o.Request: to.ID} {
		for _, id := range *side {
			c, ok := byID[id]
			if !ok || c.OwnerID != owner {
				return uuid.Nil, ErrNotOwned
			}
			if c.LockedInTradeID.Valid {
				return uuid.Nil, ErrInTrade
			}
		}
	}

	id, err := q.CreateTrade(ctx, store.CreateTradeParams{
		FromUser: from, ToUser: to.ID, CreatedAt: now, ExpiresAt: game.TradeExpiresAt(now),
	})
	if err != nil {
		return uuid.Nil, err
	}
	for _, side := range []struct {
		name string
		ids  []uuid.UUID
	}{{SideOffer, o.Offer}, {SideRequest, o.Request}} {
		if err := q.AddTradeItems(ctx, store.AddTradeItemsParams{TradeID: id, Side: side.name, CardIds: side.ids}); err != nil {
			return uuid.Nil, err
		}
	}
	if err := q.LockCardsInTrade(ctx, store.LockCardsInTradeParams{TradeID: id, Ids: o.Offer}); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// Accept swaps the cards of an offer sent to `user`, all at once. If a card is gone
// (or no longer belongs to its side) the offer fails and nothing moves.
func (s *Service) Accept(ctx context.Context, user, id uuid.UUID) (Trade, error) {
	return s.resolve(ctx, user, id, func(q *store.Queries, t store.Trade, now time.Time) (string, error) {
		if t.ToUser != user {
			return "", ErrNotFound
		}
		if !now.Before(t.ExpiresAt) {
			return StatusExpired, ErrExpired
		}
		items, err := q.ListTradeItems(ctx, []uuid.UUID{t.ID})
		if err != nil {
			return "", err
		}
		var offer, request, all []uuid.UUID
		for _, it := range items {
			all = append(all, it.CardID)
			if it.Side == SideOffer {
				offer = append(offer, it.CardID)
			} else {
				request = append(request, it.CardID)
			}
		}
		cards, err := q.LockTradeCards(ctx, all)
		if err != nil {
			return "", err
		}
		byID := make(map[uuid.UUID]store.LockTradeCardsRow, len(cards))
		for _, c := range cards {
			byID[c.ID] = c
		}
		for _, id := range offer {
			c, ok := byID[id]
			if !ok || c.OwnerID != t.FromUser || c.LockedInTradeID.Bytes != t.ID {
				return StatusFailed, ErrUnavailable
			}
		}
		for _, id := range request {
			c, ok := byID[id]
			if !ok || c.OwnerID != t.ToUser {
				return StatusFailed, ErrUnavailable
			}
			if c.LockedInTradeID.Valid {
				// The recipient offered this card elsewhere; they can cancel that and try again.
				return "", ErrInTrade
			}
		}
		if err := q.MoveCards(ctx, store.MoveCardsParams{OwnerID: t.ToUser, AcquiredAt: now, Ids: offer}); err != nil {
			return "", err
		}
		if err := q.MoveCards(ctx, store.MoveCardsParams{OwnerID: t.FromUser, AcquiredAt: now, Ids: request}); err != nil {
			return "", err
		}
		if err := q.RemoveFromShowcases(ctx, all); err != nil {
			return "", err
		}
		if err := s.givePartnerGifts(ctx, q, t, now); err != nil {
			return "", err
		}
		return StatusAccepted, nil
	})
}

// givePartnerGifts gives both players a gift the first time they trade with each
// other, unless a player already got game.PartnerGiftsPerWeek this week (the other
// still gets theirs). The gift waits on the Pack tab; its card is rolled when it is
// opened (OpenGifts).
func (s *Service) givePartnerGifts(ctx context.Context, q *store.Queries, t store.Trade, now time.Time) error {
	a, b := t.FromUser, t.ToUser
	if bytes.Compare(a[:], b[:]) > 0 {
		a, b = b, a // same order as Postgres compares uuids (the CHECK user_a < user_b)
	}
	first, err := q.AddTradePartners(ctx, store.AddTradePartnersParams{UserA: a, UserB: b, FirstTradeID: t.ID, CreatedAt: now})
	if err != nil || !first {
		return err
	}
	// Count the gifts in user id order, so trades accepted at once lock the week rows in the same order.
	week := game.GiftWeek(now)
	for _, u := range []uuid.UUID{a, b} {
		ok, err := q.CountGift(ctx, store.CountGiftParams{UserID: u, Week: week, MaxGifts: int16(game.PartnerGiftsPerWeek)})
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		if err := q.AddTradeGift(ctx, store.AddTradeGiftParams{TradeID: t.ID, UserID: u, CreatedAt: now}); err != nil {
			return err
		}
	}
	return nil
}

// Decline turns down an offer sent to `user`.
func (s *Service) Decline(ctx context.Context, user, id uuid.UUID) (Trade, error) {
	return s.resolve(ctx, user, id, func(_ *store.Queries, t store.Trade, now time.Time) (string, error) {
		if t.ToUser != user {
			return "", ErrNotFound
		}
		if !now.Before(t.ExpiresAt) {
			return StatusExpired, nil // gone either way
		}
		return StatusDeclined, nil
	})
}

// Cancel withdraws an offer `user` sent.
func (s *Service) Cancel(ctx context.Context, user, id uuid.UUID) (Trade, error) {
	return s.resolve(ctx, user, id, func(_ *store.Queries, t store.Trade, now time.Time) (string, error) {
		if t.FromUser != user {
			return "", ErrNotFound
		}
		if !now.Before(t.ExpiresAt) {
			return StatusExpired, nil
		}
		return StatusCancelled, nil
	})
}

// resolve locks an open offer and lets `decide` pick its new status. A status with an
// error is still saved (an expired or failed offer stays that way) and the error is
// returned after the commit; an error with no status rolls everything back.
func (s *Service) resolve(ctx context.Context, user, id uuid.UUID, decide func(*store.Queries, store.Trade, time.Time) (string, error)) (Trade, error) {
	now := s.Now()
	var outcome error
	var status string
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		outcome, status = nil, ""
		t, err := q.LockTrade(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && t.FromUser != user && t.ToUser != user) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if t.Status != StatusOpen {
			return &NotOpenError{Status: t.Status}
		}
		status, err = decide(q, t, now)
		if status == "" {
			if err == nil {
				err = fmt.Errorf("trades: no status decided for %s", id)
			}
			return err
		}
		outcome = err
		if err := q.ResolveTrade(ctx, store.ResolveTradeParams{Status: status, ResolvedAt: now, ID: id}); err != nil {
			return err
		}
		// Offered cards are free again (accepted ones were already moved and unlocked).
		return q.UnlockTradeCards(ctx, id)
	})
	if err != nil {
		return Trade{}, err
	}
	t, err := s.get(ctx, store.New(s.pool), id)
	if err != nil {
		return Trade{}, err
	}
	// Tell the other player (the one who didn't act).
	other, by := t.From.ID, t.To.Username
	if user == t.From.ID {
		other, by = t.To.ID, t.From.Username
	}
	if status == StatusExpired {
		by = ""
	}
	s.emit(Event{To: other, Type: "trade." + status, TradeID: t.ID, By: by})
	return t, outcome
}

// List returns the player's open offers (sent and received) and those resolved in
// the last game.TradeHistory, newest first. Offers past their time are expired first.
func (s *Service) List(ctx context.Context, user uuid.UUID) ([]Trade, error) {
	now := s.Now()
	q := store.New(s.pool)
	if _, err := s.expire(ctx, q, now); err != nil {
		return nil, err
	}
	rows, err := q.ListTrades(ctx, store.ListTradesParams{UserID: user, Since: now.Add(-game.TradeHistory)})
	if err != nil {
		return nil, err
	}
	out := make([]Trade, len(rows))
	for i, r := range rows {
		out[i] = toTrade(store.GetTradeRow(r))
	}
	if err := s.fillItems(ctx, q, out); err != nil {
		return nil, err
	}
	return out, nil
}

// Expire resolves every open offer past its time and unlocks its cards.
func (s *Service) Expire(ctx context.Context) (int, error) {
	return s.expire(ctx, store.New(s.pool), s.Now())
}

// expire expires due offers and tells both players of each.
func (s *Service) expire(ctx context.Context, q *store.Queries, now time.Time) (int, error) {
	due, err := q.ExpireDueTrades(ctx, now)
	for _, t := range due {
		for _, u := range []uuid.UUID{t.FromUser, t.ToUser} {
			s.emit(Event{To: u, Type: "trade." + StatusExpired, TradeID: t.ID})
		}
	}
	return len(due), err
}

// Run expires offers now and then every `every` until ctx is done (offers also
// expire when listed or acted on; this frees locked cards of idle players).
func (s *Service) Run(ctx context.Context, every time.Duration) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		if n, err := s.Expire(ctx); err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "trade expiry failed", "err", err)
		} else if n > 0 {
			slog.InfoContext(ctx, "trades expired", "count", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func (s *Service) get(ctx context.Context, q *store.Queries, id uuid.UUID) (Trade, error) {
	row, err := q.GetTrade(ctx, id)
	if err != nil {
		return Trade{}, err
	}
	out := []Trade{toTrade(row)}
	if err := s.fillItems(ctx, q, out); err != nil {
		return Trade{}, err
	}
	return out[0], nil
}

func toTrade(r store.GetTradeRow) Trade {
	t := Trade{
		ID:        r.ID,
		From:      Player{ID: r.FromUser, Username: r.FromUsername},
		To:        Player{ID: r.ToUser, Username: r.ToUsername},
		Status:    r.Status,
		CreatedAt: r.CreatedAt,
		ExpiresAt: r.ExpiresAt,
	}
	if r.ResolvedAt.Valid {
		at := r.ResolvedAt.Time
		t.ResolvedAt = &at
	}
	return t
}

// fillItems loads the cards of the trades, with what the client needs to draw them.
func (s *Service) fillItems(ctx context.Context, q *store.Queries, trades []Trade) error {
	if len(trades) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(trades))
	index := make(map[uuid.UUID]int, len(trades))
	for i, t := range trades {
		ids[i] = t.ID
		index[t.ID] = i
	}
	items, err := q.ListTradeItems(ctx, ids)
	if err != nil {
		return err
	}
	gifts, err := q.ListTradeGifts(ctx, ids)
	if err != nil {
		return err
	}
	cardIDs := make([]uuid.UUID, len(items))
	for i, it := range items {
		cardIDs[i] = it.CardID
	}
	cards, err := q.GetOwnedCards(ctx, cardIDs)
	if err != nil {
		return err
	}
	byID := make(map[uuid.UUID]*store.GetOwnedCardsRow, len(cards))
	for i := range cards {
		byID[cards[i].ID] = &cards[i]
	}
	for _, it := range items {
		t := &trades[index[it.TradeID]]
		item := Item{CardID: it.CardID, Card: byID[it.CardID]}
		if it.Side == SideOffer {
			t.Offer = append(t.Offer, item)
		} else {
			t.Request = append(t.Request, item)
		}
	}
	for _, g := range gifts {
		t := &trades[index[g.TradeID]]
		t.GiftedTo = append(t.GiftedTo, g.UserID)
	}
	return nil
}
