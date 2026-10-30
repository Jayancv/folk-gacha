package game

import (
	"errors"
	"testing"
)

func TestPlanMerge(t *testing.T) {
	calf := func(level int) MergeInput { return MergeInput{TemplateID: "gaja-calf", Level: level} }
	simha := MergeInput{TemplateID: "simha", Level: 3}
	malu := MergeInput{TemplateID: "malu", Level: 1}

	tests := []struct {
		name            string
		dragged, target MergeInput
		recipe          string
		want            MergePlan
		err             error
	}{
		{"level up", calf(1), calf(1), "", MergePlan{Kind: LevelUp, Level: 2}, nil},
		{"level 4 to 5", calf(4), calf(4), "", MergePlan{Kind: LevelUp, Level: 5}, nil},
		{"already max level", calf(MaxLevel), calf(MaxLevel), "", MergePlan{}, ErrMaxLevel},
		{"bad stored level above max", calf(MaxLevel + 1), calf(MaxLevel + 1), "", MergePlan{}, ErrMaxLevel},
		{"same spirit, different levels", calf(1), calf(2), "", MergePlan{}, ErrNoRecipe},
		{"recipe at any level starts at 1", calf(2), simha, "gajasinghe", MergePlan{Kind: RecipeMerge, Level: 1, Output: "gajasinghe"}, nil},
		{"different spirits, no recipe", calf(1), malu, "", MergePlan{}, ErrNoRecipe},
		// A same-spirit pair never uses a recipe, even if one were passed.
		{"same spirit ignores recipe", calf(1), calf(1), "makara", MergePlan{Kind: LevelUp, Level: 2}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := PlanMerge(tt.dragged, tt.target, tt.recipe)
			if !errors.Is(err, tt.err) || got != tt.want {
				t.Fatalf("got %+v, %v; want %+v, %v", got, err, tt.want, tt.err)
			}
		})
	}
}
