// Package httpapi holds the HTTP layer: handlers generated from api/openapi.yaml
// plus middleware. Handlers only parse requests and call into internal/game.
package httpapi

//go:generate go tool oapi-codegen -config oapi-codegen.yaml ../../../api/openapi.yaml
