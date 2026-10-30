package push

import (
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/golang-jwt/jwt/v5"
)

// What our sender actually puts on the wire, against a local stand-in push service:
// a VAPID JWT signed with our key, an encrypted body, and the delivery headers.
func TestWebPushRequest(t *testing.T) {
	vapidPrivate, vapidPublic, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	// The browser's side of the subscription: its own key pair and auth secret.
	browserKey, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	secret := make([]byte, 16)
	_, _ = rand.Read(secret)

	var got *http.Request
	var body []byte
	status := http.StatusCreated
	// Plain HTTP: the sender doesn't care about the scheme (Subscription.Validate, which
	// requires https and a known push host, runs when a subscription is saved).
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(status)
	}))
	defer service.Close()

	sender := NewWebPush(vapidPublic, vapidPrivate, "mailto:test@example.com")
	sub := Subscription{
		Endpoint: service.URL + "/push/abc",
		P256dh:   base64.RawURLEncoding.EncodeToString(browserKey.PublicKey().Bytes()),
		Auth:     base64.RawURLEncoding.EncodeToString(secret),
	}
	payload := []byte(`{"title":"Your daily pack is ready"}`)

	code, err := sender.Send(context.Background(), sub, payload)
	if err != nil || code != http.StatusCreated {
		t.Fatalf("send: %d %v", code, err)
	}
	h := got.Header
	if h.Get("Content-Encoding") != "aes128gcm" || h.Get("TTL") != "43200" || h.Get("Topic") != "daily-pack" || h.Get("Urgency") != "normal" {
		t.Fatalf("headers %v", h)
	}
	// Encrypted: the plain payload must not appear on the wire.
	if strings.Contains(string(body), "daily pack") || len(body) <= len(payload) {
		t.Fatalf("body is not encrypted (%d bytes)", len(body))
	}

	// Authorization: vapid t=<JWT>, k=<our public key>; the JWT verifies with that key.
	auth := h.Get("Authorization")
	if !strings.HasPrefix(auth, "vapid t=") || !strings.Contains(auth, "k="+vapidPublic) {
		t.Fatalf("authorization %q", auth)
	}
	token := strings.TrimSuffix(strings.SplitN(strings.TrimPrefix(auth, "vapid t="), ",", 2)[0], " ")
	raw, _ := base64.RawURLEncoding.DecodeString(vapidPublic)
	pub := &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(raw[1:33]), Y: new(big.Int).SetBytes(raw[33:])}
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) { return pub, nil }, jwt.WithValidMethods([]string{"ES256"})); err != nil {
		t.Fatalf("VAPID JWT doesn't verify with our public key: %v", err)
	}
	if claims["sub"] != "mailto:test@example.com" || claims["aud"] != service.URL {
		t.Fatalf("claims %v", claims)
	}

	// The push service's answer comes back as the status (410 = subscription gone).
	status = http.StatusGone
	if code, err := sender.Send(context.Background(), sub, payload); err != nil || code != http.StatusGone {
		t.Fatalf("gone: %d %v", code, err)
	}
}
