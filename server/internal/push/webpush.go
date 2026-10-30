package push

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// WebPush sends through the browsers' push services, signed with our VAPID keys.
type WebPush struct {
	PublicKey  string
	PrivateKey string
	// Subject is a contact for the push services: "mailto:you@example.com" or an https URL.
	Subject string
	Client  *http.Client
}

// NewWebPush returns a Sender with a sensible HTTP timeout.
func NewWebPush(publicKey, privateKey, subject string) *WebPush {
	return &WebPush{PublicKey: publicKey, PrivateKey: privateKey, Subject: subject, Client: &http.Client{Timeout: 15 * time.Second}}
}

// subscriber is the Subject as webpush-go wants it: it adds "mailto:" itself to anything
// that isn't an https URL, so a "mailto:" subject would become "mailto:mailto:…" (which
// push services, Apple's especially, reject).
func (w *WebPush) subscriber() string {
	return strings.TrimPrefix(w.Subject, "mailto:")
}

func (w *WebPush) Send(ctx context.Context, sub Subscription, payload []byte) (int, error) {
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		HTTPClient:      w.Client,
		Subscriber:      w.subscriber(),
		VAPIDPublicKey:  w.PublicKey,
		VAPIDPrivateKey: w.PrivateKey,
		// Undelivered by the next reset, it's stale; a newer one replaces a pending one.
		TTL:     12 * 60 * 60,
		Topic:   "daily-pack",
		Urgency: webpush.UrgencyNormal,
	})
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, nil
}
