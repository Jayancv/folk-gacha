package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/coreos/go-oidc/v3/oidc"
)

// GoogleIdentity is what we keep from a verified Google ID token.
type GoogleIdentity struct {
	// Subject is Google's stable account id; email can change, this can't.
	Subject string
	Email   string
	Name    string
}

// GoogleVerifier checks a Google ID token. Tests use a fake.
type GoogleVerifier interface {
	Verify(ctx context.Context, credential string) (GoogleIdentity, error)
}

var ErrInvalidToken = errors.New("auth: invalid Google token")

const googleCertsURL = "https://www.googleapis.com/oauth2/v3/certs"

// Google ID tokens carry either issuer form.
var googleIssuers = map[string]bool{"https://accounts.google.com": true, "accounts.google.com": true}

type googleVerifier struct {
	verifier *oidc.IDTokenVerifier
}

// NewGoogleVerifier verifies tokens issued to clientID: signature (Google's
// published keys, cached and rotated by go-oidc), audience, issuer and expiry.
func NewGoogleVerifier(ctx context.Context, clientID string) GoogleVerifier {
	keys := oidc.NewRemoteKeySet(ctx, googleCertsURL)
	return &googleVerifier{
		// Issuer is checked below because Google uses two spellings.
		verifier: oidc.NewVerifier("https://accounts.google.com", keys, &oidc.Config{ClientID: clientID, SkipIssuerCheck: true}),
	}
}

func (g *googleVerifier) Verify(ctx context.Context, credential string) (GoogleIdentity, error) {
	tok, err := g.verifier.Verify(ctx, credential)
	if err != nil {
		return GoogleIdentity{}, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	if !googleIssuers[tok.Issuer] {
		return GoogleIdentity{}, fmt.Errorf("%w: issuer %q", ErrInvalidToken, tok.Issuer)
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := tok.Claims(&claims); err != nil {
		return GoogleIdentity{}, fmt.Errorf("%w: claims: %v", ErrInvalidToken, err)
	}
	if tok.Subject == "" {
		return GoogleIdentity{}, fmt.Errorf("%w: no subject", ErrInvalidToken)
	}
	email := claims.Email
	if !claims.EmailVerified {
		// Unverified emails are never used, not even for the default username.
		email = ""
	}
	return GoogleIdentity{Subject: tok.Subject, Email: email, Name: claims.Name}, nil
}
