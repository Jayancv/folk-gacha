// Package game holds the game rules as plain functions: pack rolls, merges, scoring.
// HTTP handlers and the seed command call into it; it never touches the database.
package game

import (
	"errors"
	"fmt"
	"strings"
)

// Recipe: two different spirits make Output. Inputs are kept sorted (A < B) so a
// recipe has one key whichever card the player drags onto the other.
type Recipe struct {
	A, B   string
	Output string
}

// RecipeKey is the sorted pair for two template ids (the merge_recipes lookup key).
func RecipeKey(x, y string) (a, b string) {
	if y < x {
		return y, x
	}
	return x, y
}

// RecipeSpec is one entry of seed/recipes.json.
type RecipeSpec struct {
	Inputs []string `json:"inputs"`
	Output string   `json:"output"`
}

// NormalizeRecipes validates recipe specs against the known template ids and
// returns them sorted by key. It rejects anything a merge couldn't use: unknown
// spirits, a spirit with itself (that's a level-up), the same pair twice, or a
// recipe that outputs one of its own inputs.
func NormalizeRecipes(specs []RecipeSpec, templates map[string]bool) ([]Recipe, error) {
	var errs []error
	seen := map[[2]string]int{}
	out := make([]Recipe, 0, len(specs))

	for i, s := range specs {
		where := fmt.Sprintf("recipe %d (%s -> %s)", i+1, strings.Join(s.Inputs, " + "), s.Output)
		if len(s.Inputs) != 2 {
			errs = append(errs, fmt.Errorf("%s: needs exactly 2 inputs (3-card rituals aren't supported yet)", where))
			continue
		}
		bad := false
		for _, id := range append([]string{s.Inputs[0], s.Inputs[1]}, s.Output) {
			if !templates[id] {
				errs = append(errs, fmt.Errorf("%s: unknown template %q", where, id))
				bad = true
			}
		}
		if bad {
			continue
		}
		a, b := RecipeKey(s.Inputs[0], s.Inputs[1])
		switch {
		case a == b:
			errs = append(errs, fmt.Errorf("%s: two of the same spirit is a level-up, not a recipe", where))
		case s.Output == a || s.Output == b:
			errs = append(errs, fmt.Errorf("%s: output can't be one of its inputs", where))
		case seen[[2]string{a, b}] > 0:
			errs = append(errs, fmt.Errorf("%s: same inputs as recipe %d", where, seen[[2]string{a, b}]))
		default:
			seen[[2]string{a, b}] = i + 1
			out = append(out, Recipe{A: a, B: b, Output: s.Output})
		}
	}
	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}
	return out, nil
}
