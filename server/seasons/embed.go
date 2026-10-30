// Package seasons embeds each card season's generated seed.sql, so cmd/seed can
// load the catalog from inside the binary (no files needed on the server).
package seasons

import "embed"

//go:embed */seed.sql
var SeedSQL embed.FS
