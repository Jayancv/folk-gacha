// Package rules embeds the tunable game rules (game.yaml). internal/game parses and
// checks them at startup; this package only carries the file into the binary.
package rules

import _ "embed"

//go:embed game.yaml
var GameYAML []byte
