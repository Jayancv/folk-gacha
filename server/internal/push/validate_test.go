package push

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"
)

var (
	p256dh = base64.RawURLEncoding.EncodeToString(append([]byte{4}, make([]byte, 64)...)) // 65 bytes
	auth   = base64.RawURLEncoding.EncodeToString(make([]byte, 16))
)

func sub(endpoint string) Subscription {
	return Subscription{Endpoint: endpoint, P256dh: p256dh, Auth: auth}
}

func TestValidateAcceptsBrowserPushServices(t *testing.T) {
	for _, e := range []string{
		"https://fcm.googleapis.com/fcm/send/abc:APA91b",
		"https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
		"https://web.push.apple.com/QGuQyavXut",
		"https://wns2-by3p.notify.windows.com/w/?token=x",
	} {
		if err := sub(e).Validate(); err != nil {
			t.Errorf("%s: %v", e, err)
		}
	}
	// Padded base64 (some browsers' toJSON) is fine too.
	s := sub("https://fcm.googleapis.com/fcm/send/x")
	s.Auth += "=="
	if err := s.Validate(); err != nil {
		t.Errorf("padded auth: %v", err)
	}
}

// The server POSTs to the endpoint, so anything else could aim it at internal services.
func TestValidateRejectsOtherURLs(t *testing.T) {
	for _, e := range []string{
		"http://fcm.googleapis.com/fcm/send/x",      // not https
		"https://localhost/push",                    // internal
		"https://169.254.169.254/latest/meta-data",  // cloud metadata
		"https://evil.example/fcm.googleapis.com",   // host is what counts
		"https://fcm.googleapis.com.evil.example/x", // suffix trick
		"https://notpush.apple.com/x",               // not a subdomain of push.apple.com
		"https://user@fcm.googleapis.com/x",         // credentials
		"https://fcm.googleapis.com:8443/x",         // odd port
		"https://fcm.googleapis.com/" + strings.Repeat("a", 2100),
		"not a url",
	} {
		if err := sub(e).Validate(); !errors.Is(err, ErrBadSubscription) {
			t.Errorf("%s: err = %v", e, err)
		}
	}
}

func TestValidateChecksKeys(t *testing.T) {
	ok := sub("https://fcm.googleapis.com/fcm/send/x")
	for name, s := range map[string]Subscription{
		"short p256dh": {Endpoint: ok.Endpoint, P256dh: base64.RawURLEncoding.EncodeToString(make([]byte, 32)), Auth: auth},
		"short auth":   {Endpoint: ok.Endpoint, P256dh: p256dh, Auth: base64.RawURLEncoding.EncodeToString(make([]byte, 8))},
		"not base64":   {Endpoint: ok.Endpoint, P256dh: "!!!", Auth: auth},
		"empty":        {Endpoint: ok.Endpoint},
	} {
		if err := s.Validate(); !errors.Is(err, ErrBadSubscription) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}
