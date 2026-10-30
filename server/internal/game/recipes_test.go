package game

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

var templates = map[string]bool{"gaja-calf": true, "simha": true, "monara": true, "gajasinghe": true, "serapendiya": true}

func TestRecipeKeyIsOrderIndependent(t *testing.T) {
	a1, b1 := RecipeKey("simha", "gaja-calf")
	a2, b2 := RecipeKey("gaja-calf", "simha")
	if a1 != a2 || b1 != b2 || a1 != "gaja-calf" {
		t.Fatalf("got (%s,%s) and (%s,%s)", a1, b1, a2, b2)
	}
}

func TestNormalizeRecipes(t *testing.T) {
	got, err := NormalizeRecipes([]RecipeSpec{
		{Inputs: []string{"simha", "gaja-calf"}, Output: "gajasinghe"},
		{Inputs: []string{"monara", "simha"}, Output: "serapendiya"},
	}, templates)
	if err != nil {
		t.Fatal(err)
	}
	want := []Recipe{{A: "gaja-calf", B: "simha", Output: "gajasinghe"}, {A: "monara", B: "simha", Output: "serapendiya"}}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestNormalizeRecipesRejects(t *testing.T) {
	tests := []struct {
		name string
		spec RecipeSpec
		want string
	}{
		{"unknown input", RecipeSpec{Inputs: []string{"gaja-calf", "dragon"}, Output: "gajasinghe"}, `unknown template "dragon"`},
		{"unknown output", RecipeSpec{Inputs: []string{"gaja-calf", "simha"}, Output: "phoenix"}, `unknown template "phoenix"`},
		{"same spirit twice", RecipeSpec{Inputs: []string{"simha", "simha"}, Output: "gajasinghe"}, "level-up"},
		{"output is an input", RecipeSpec{Inputs: []string{"gaja-calf", "simha"}, Output: "simha"}, "output can't be one of its inputs"},
		{"three inputs", RecipeSpec{Inputs: []string{"gaja-calf", "simha", "monara"}, Output: "gajasinghe"}, "exactly 2 inputs"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NormalizeRecipes([]RecipeSpec{tt.spec}, templates)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("err = %v, want it to mention %q", err, tt.want)
			}
		})
	}
}

func TestNormalizeRecipesRejectsDuplicatePairsInEitherOrder(t *testing.T) {
	_, err := NormalizeRecipes([]RecipeSpec{
		{Inputs: []string{"gaja-calf", "simha"}, Output: "gajasinghe"},
		{Inputs: []string{"simha", "gaja-calf"}, Output: "serapendiya"},
	}, templates)
	if err == nil || !strings.Contains(err.Error(), "same inputs as recipe 1") {
		t.Fatalf("err = %v", err)
	}
}

func TestNormalizeRecipesReportsEveryProblem(t *testing.T) {
	_, err := NormalizeRecipes([]RecipeSpec{
		{Inputs: []string{"x", "simha"}, Output: "gajasinghe"},
		{Inputs: []string{"simha", "simha"}, Output: "gajasinghe"},
	}, templates)
	if err == nil || !strings.Contains(err.Error(), "recipe 1") || !strings.Contains(err.Error(), "recipe 2") {
		t.Fatalf("both problems should be reported: %v", err)
	}
}

// The checked-in recipes must be valid against the Season 1 spirits.
func TestSeedRecipesAreValid(t *testing.T) {
	var cfg struct {
		Spirits []struct {
			ID string `json:"id"`
		} `json:"spirits"`
	}
	readJSON(t, "../../seasons/s1/config.json", &cfg)
	known := map[string]bool{}
	for _, s := range cfg.Spirits {
		known[s.ID] = true
	}
	var file struct {
		Recipes []RecipeSpec `json:"recipes"`
	}
	readJSON(t, "../../seed/recipes.json", &file)
	if len(file.Recipes) == 0 {
		t.Fatal("seed/recipes.json has no recipes")
	}
	if _, err := NormalizeRecipes(file.Recipes, known); err != nil {
		t.Fatal(err)
	}
}

func readJSON(t *testing.T, path string, v any) {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
}
