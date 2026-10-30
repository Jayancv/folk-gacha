package game

import "errors"

var (
	// ErrNoRecipe: these two cards don't merge (different spirits with no
	// recipe, or the same spirit at different levels).
	ErrNoRecipe = errors.New("no recipe for these cards")
	// ErrMaxLevel: the cards are already at MaxLevel.
	ErrMaxLevel = errors.New("cards are already at the highest level")
)

// MergeKind is what a merge does.
type MergeKind string

const (
	// LevelUp: two cards of the same spirit and level make one card a level higher.
	LevelUp MergeKind = "level_up"
	// RecipeMerge: two different spirits from a recipe make a new spirit.
	RecipeMerge MergeKind = "recipe"
)

// MergeInput is the part of a card the merge rules look at.
type MergeInput struct {
	TemplateID string
	Level      int
}

// MergePlan is the outcome of a merge, decided before anything is written.
type MergePlan struct {
	Kind MergeKind
	// Level of the resulting card.
	Level int
	// Output spirit of a recipe merge (empty for a level-up, which keeps the
	// target card's season card, so its look and copy number).
	Output string
}

// PlanMerge decides what dropping `dragged` onto `target` makes. recipeOutput
// is the output spirit of the recipe for the pair (RecipeKey), or "" if none.
//
// Level up: same spirit at the same level, below MaxLevel. Recipes: any levels;
// the new card starts at level 1.
func PlanMerge(dragged, target MergeInput, recipeOutput string) (MergePlan, error) {
	if dragged.TemplateID == target.TemplateID {
		switch {
		case dragged.Level != target.Level:
			return MergePlan{}, ErrNoRecipe
		case target.Level >= MaxLevel:
			return MergePlan{}, ErrMaxLevel
		}
		return MergePlan{Kind: LevelUp, Level: target.Level + 1}, nil
	}
	if recipeOutput == "" {
		return MergePlan{}, ErrNoRecipe
	}
	return MergePlan{Kind: RecipeMerge, Level: 1, Output: recipeOutput}, nil
}
