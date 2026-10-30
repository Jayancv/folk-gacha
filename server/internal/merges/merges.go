// Package merges runs a merge as one database transaction: lock both cards and
// check the player owns them, decide the result (rules in internal/game),
// remove both cards and create the result, and record recipe discoveries.
package merges

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/mint"
	"cardgame/server/internal/store"
)

var (
	// ErrSameCard: a card can't be merged with itself.
	ErrSameCard = errors.New("merges: a card can't merge with itself")
	// ErrNotOwned: one of the cards doesn't exist, belongs to someone else, or
	// was just used up by another merge. The three look the same on purpose.
	ErrNotOwned = errors.New("merges: card not owned")
	// ErrSoldOut: the recipe's output spirit has no copies left in the season.
	ErrSoldOut = errors.New("merges: recipe output sold out")
)

// game.ErrNoRecipe and game.ErrMaxLevel are returned as they are.

// Service merges cards.
type Service struct {
	pool *pgxpool.Pool
	// Rand picks which season card a recipe makes. Must be safe for concurrent use.
	Rand game.Rand
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, Rand: mint.GlobalRand{}}
}

// Result is a finished merge.
type Result struct {
	Kind game.MergeKind
	Card store.GetOwnedCardsRow
	// Discovered is true the first time this player makes this recipe.
	Discovered bool
}

// Merge drops `dragged` onto `target`. A level-up keeps the target's season
// card (its look and copy number); a recipe makes a new card of the output spirit
// from the target's card season.
func (s *Service) Merge(ctx context.Context, userID, dragged, target uuid.UUID) (Result, error) {
	if dragged == target {
		return Result{}, ErrSameCard
	}
	var res Result
	var id uuid.UUID
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		var err error
		res, id, err = s.mergeTx(ctx, q, userID, dragged, target)
		return err
	})
	if errors.Is(err, mint.ErrSoldOut) {
		return Result{}, ErrSoldOut
	}
	if err != nil {
		return Result{}, err
	}
	cards, err := mint.LoadCards(ctx, store.New(s.pool), []uuid.UUID{id})
	if err != nil {
		return Result{}, err
	}
	res.Card = cards[0]
	return res, nil
}

func (s *Service) mergeTx(ctx context.Context, q *store.Queries, userID, draggedID, targetID uuid.UUID) (Result, uuid.UUID, error) {
	// Row locks on both cards: a concurrent merge or (later) trade of either
	// card waits for this transaction, then finds the card gone.
	rows, err := q.LockOwnedCards(ctx, store.LockOwnedCardsParams{Ids: []uuid.UUID{draggedID, targetID}, OwnerID: userID})
	if err != nil {
		return Result{}, uuid.Nil, err
	}
	if len(rows) != 2 {
		return Result{}, uuid.Nil, ErrNotOwned
	}
	dragged, target := rows[0], rows[1]
	if dragged.ID != draggedID {
		dragged, target = target, dragged
	}

	var recipe store.GetRecipeRow
	if dragged.TemplateID != target.TemplateID {
		a, b := game.RecipeKey(dragged.TemplateID, target.TemplateID)
		recipe, err = q.GetRecipe(ctx, store.GetRecipeParams{InputA: a, InputB: b})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Result{}, uuid.Nil, err
		}
	}
	plan, err := game.PlanMerge(
		game.MergeInput{TemplateID: dragged.TemplateID, Level: int(dragged.Level)},
		game.MergeInput{TemplateID: target.TemplateID, Level: int(target.Level)},
		recipe.OutputTemplateID,
	)
	if err != nil {
		return Result{}, uuid.Nil, err
	}

	if err := q.DeleteCards(ctx, []uuid.UUID{dragged.ID, target.ID}); err != nil {
		return Result{}, uuid.Nil, err
	}

	res := Result{Kind: plan.Kind}
	newCard := store.CreateCardParams{OwnerID: userID, Level: int16(plan.Level), AcquiredVia: "merge"}
	switch plan.Kind {
	case game.LevelUp:
		// Same copy, one level higher (its row was just deleted, so the copy number is free).
		newCard.SeasonCardID, newCard.CopyNo = target.SeasonCardID, target.CopyNo
	case game.RecipeMerge:
		pullable, err := q.ListPullableCards(ctx, store.ListPullableCardsParams{
			CardSeasonID: target.CardSeasonID,
			TemplateID:   pgtype.Text{String: plan.Output, Valid: true},
		})
		if err != nil {
			return Result{}, uuid.Nil, err
		}
		if len(pullable) == 0 {
			return Result{}, uuid.Nil, mint.ErrSoldOut
		}
		// Every card of one spirit has the spirit's rarity.
		picks, err := mint.Pick(s.Rand, []game.Rarity{game.Rarity(pullable[0].Rarity)}, pullable)
		if err != nil {
			return Result{}, uuid.Nil, err
		}
		copyNos, err := mint.Take(ctx, q, picks)
		if err != nil {
			return Result{}, uuid.Nil, err
		}
		newCard.SeasonCardID, newCard.CopyNo = picks[0].ID, copyNos[0]

		n, err := q.DiscoverRecipe(ctx, store.DiscoverRecipeParams{UserID: userID, RecipeID: recipe.ID})
		if err != nil {
			return Result{}, uuid.Nil, err
		}
		res.Discovered = n == 1
	}
	id, err := q.CreateCard(ctx, newCard)
	if err != nil {
		return Result{}, uuid.Nil, err
	}
	return res, id, nil
}

// Discovered lists the recipes the player has made, oldest discovery first.
func (s *Service) Discovered(ctx context.Context, userID uuid.UUID) ([]store.ListDiscoveredRecipesRow, error) {
	return store.New(s.pool).ListDiscoveredRecipes(ctx, userID)
}
