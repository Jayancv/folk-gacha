package trades

import (
	"context"
	"errors"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cardgame/server/internal/game"
	"cardgame/server/internal/mint"
	"cardgame/server/internal/store"
)

var (
	// ErrNoGifts: the player has no unopened gift.
	ErrNoGifts = errors.New("trades: no gifts waiting")
	// ErrNoSeason: no card season is open, so there is nothing to give.
	ErrNoSeason = errors.New("trades: no card season")
)

// MaxGiftsPerOpen is how many waiting gifts one open turns into cards (the pack table shows up to 5).
const MaxGiftsPerOpen = 5

// OpenedGift is a gift turned into its card.
type OpenedGift struct {
	TradeID uuid.UUID
	// Partner is the username of the player the trade was with.
	Partner string
	Card    store.GetOwnedCardsRow
}

// WaitingGifts is how many unopened gifts `user` has.
func (s *Service) WaitingGifts(ctx context.Context, user uuid.UUID) (int, error) {
	n, err := store.New(s.pool).CountWaitingGifts(ctx, user)
	return int(n), err
}

// OpenGifts turns up to MaxGiftsPerOpen of the player's waiting gifts into cards, in
// one transaction: each a level-1 Common or Uncommon (game.GiftRarity) of the current
// card season, counted as traded (no season points, even when merged).
func (s *Service) OpenGifts(ctx context.Context, user uuid.UUID) ([]OpenedGift, error) {
	now := s.Now()
	var opened []OpenedGift
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		opened = nil
		waiting, err := q.LockWaitingGifts(ctx, store.LockWaitingGiftsParams{UserID: user, MaxGifts: MaxGiftsPerOpen})
		if err != nil {
			return err
		}
		if len(waiting) == 0 {
			return ErrNoGifts
		}
		season, err := q.CurrentCardSeason(ctx, now)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoSeason
		}
		if err != nil {
			return err
		}
		pullable, err := q.ListPullableCards(ctx, store.ListPullableCardsParams{CardSeasonID: season.ID})
		if err != nil {
			return err
		}
		var giftable []mint.Card
		for _, c := range pullable {
			if slices.Contains(game.GiftRarities, game.Rarity(c.Rarity)) {
				giftable = append(giftable, c)
			}
		}
		slots := make([]game.Rarity, len(waiting))
		for i := range slots {
			slots[i] = game.GiftRarity(s.Rand)
		}
		picks, err := mint.Pick(s.Rand, slots, giftable)
		if err != nil {
			return err
		}
		copyNos, err := mint.Take(ctx, q, picks)
		if err != nil {
			return err
		}
		for i, g := range waiting {
			id, err := q.CreateCard(ctx, store.CreateCardParams{
				SeasonCardID: picks[i].ID, CopyNo: copyNos[i], OwnerID: user, Level: 1, AcquiredVia: "gift", Traded: true,
			})
			if err != nil {
				return err
			}
			if err := q.OpenTradeGift(ctx, store.OpenTradeGiftParams{CardID: id, OpenedAt: now, TradeID: g.TradeID, UserID: user}); err != nil {
				return err
			}
			opened = append(opened, OpenedGift{TradeID: g.TradeID, Partner: g.Partner, Card: store.GetOwnedCardsRow{ID: id}})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(opened))
	for i, g := range opened {
		ids[i] = g.Card.ID
	}
	cards, err := mint.LoadCards(ctx, store.New(s.pool), ids)
	if err != nil {
		return nil, err
	}
	for i := range opened {
		opened[i].Card = cards[i]
	}
	return opened, nil
}
