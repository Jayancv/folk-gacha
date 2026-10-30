// Package httpapi holds the HTTP layer: handlers generated from the API spec (api/openapi.bundled.yaml)
// plus middleware. Handlers only parse requests and call into internal/game.
package httpapi

//go:generate go tool oapi-codegen -config oapi-codegen.yaml ../../../api/openapi.bundled.yaml
