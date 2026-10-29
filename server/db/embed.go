// Package db embeds the goose migrations so the migrate command ships them inside the binary.
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
