package trades

import (
	"context"
	"errors"
	"slices"
	"time"

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

// OpenedGift is a gift turned into its card: a partner gift from a trade, or a
// tournament prize card (both wait on the Pack tab).
type OpenedGift struct {
	// TradeID and Partner (the username of the player the trade was with): partner gifts.
	TradeID uuid.UUID
	Partner string
	// Tournament, TournamentName and Place: prize cards.
	Tournament     string
	TournamentName string
	Place          int
	Card           store.GetOwnedCardsRow
}

// waitingGift is a partner gift or a prize card, before it's opened.
type waitingGift struct {
	at    time.Time
	gift  OpenedGift
	prize int16 // the prize row's n (prize cards only)
}

// WaitingGifts is how many unopened gifts and prize cards `user` has.
func (s *Service) WaitingGifts(ctx context.Context, user uuid.UUID) (int, error) {
	n, err := store.New(s.pool).CountWaitingGifts(ctx, user)
	return int(n), err
}

// OpenGifts turns up to MaxGiftsPerOpen of the player's waiting partner gifts and
// tournament prize cards (oldest first) into cards, in one transaction: each a level-1
// Common or Uncommon (game.GiftRarity) of the current card season. Partner gifts count as
// traded (no season points, even when merged); prize cards were won, so they count as
// normal cards (acquired_via = prize).
func (s *Service) OpenGifts(ctx context.Context, user uuid.UUID) ([]OpenedGift, error) {
	now := s.Now()
	var opened []OpenedGift
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		opened = nil
		gifts, err := q.LockWaitingGifts(ctx, store.LockWaitingGiftsParams{UserID: user, MaxGifts: MaxGiftsPerOpen})
		if err != nil {
			return err
		}
		prizes, err := q.LockWaitingPrizes(ctx, store.LockWaitingPrizesParams{UserID: user, MaxPrizes: MaxGiftsPerOpen})
		if err != nil {
			return err
		}
		var waiting []waitingGift
		for _, g := range gifts {
			waiting = append(waiting, waitingGift{at: g.CreatedAt, gift: OpenedGift{TradeID: g.TradeID, Partner: g.Partner}})
		}
		for _, p := range prizes {
			waiting = append(waiting, waitingGift{at: p.CreatedAt, prize: p.N, gift: OpenedGift{
				Tournament: p.TournamentID, TournamentName: p.Name, Place: int(p.Place),
			}})
		}
		// Oldest first across both kinds (stable: each list is already in order).
		slices.SortStableFunc(waiting, func(a, b waitingGift) int { return a.at.Compare(b.at) })
		if len(waiting) > MaxGiftsPerOpen {
			waiting = waiting[:MaxGiftsPerOpen]
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
		for i, w := range waiting {
			isPrize := w.gift.Tournament != ""
			via, traded := "gift", true
			if isPrize {
				via, traded = "prize", false
			}
			id, err := q.CreateCard(ctx, store.CreateCardParams{
				SeasonCardID: picks[i].ID, CopyNo: copyNos[i], OwnerID: user, Level: 1, AcquiredVia: via, Traded: traded,
			})
			if err != nil {
				return err
			}
			if isPrize {
				err = q.OpenTournamentPrize(ctx, store.OpenTournamentPrizeParams{
					CardID: id, OpenedAt: now, TournamentID: w.gift.Tournament, UserID: user, N: w.prize,
				})
			} else {
				err = q.OpenTradeGift(ctx, store.OpenTradeGiftParams{CardID: id, OpenedAt: now, TradeID: w.gift.TradeID, UserID: user})
			}
			if err != nil {
				return err
			}
			g := w.gift
			g.Card = store.GetOwnedCardsRow{ID: id}
			opened = append(opened, g)
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
