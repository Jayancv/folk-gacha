// Package rules embeds the tunable game rules (game.yaml, tournaments.yaml). internal/game
// parses and checks them at startup; this package only carries the files into the binary.
package rules

import _ "embed"

//go:embed game.yaml
var GameYAML []byte

//go:embed tournaments.yaml
var TournamentsYAML []byte
