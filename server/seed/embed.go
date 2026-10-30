// Package seed embeds hand-written reference data (recipes) for cmd/seed.
package seed

import _ "embed"

//go:embed recipes.json
var RecipesJSON []byte
