// Package auth signs players in (Google, or dev names locally) and manages sessions.
// HTTP handlers call into it; it never trusts identity claims it hasn't verified.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

// NewToken returns a random session token (256 bits, URL-safe base64).
// The token goes in the cookie; only HashToken(token) is stored.
func NewToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand never fails on supported platforms; refuse to issue a weak token.
		panic("auth: crypto/rand failed: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// HashToken is what the sessions table stores and looks up.
func HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
