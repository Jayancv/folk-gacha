package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/auth/authtest"
)

func TestBodyLimit(t *testing.T) {
	ts := newTestServer(AuthOptions{DevLogin: true})

	big := `{"name":"asha","pad":"` + strings.Repeat("x", maxBodyBytes) + `"}`
	rec := ts.do(t, "POST", "/auth/dev", big, nil)
	if rec.Code != http.StatusRequestEntityTooLarge || decode[Error](t, rec).Error != "too_large" {
		t.Fatalf("over the limit: %d %s", rec.Code, rec.Body)
	}
	if rec := ts.do(t, "POST", "/auth/dev", `{"name":"asha"}`, nil); rec.Code != http.StatusOK {
		t.Fatalf("a normal body: %d %s", rec.Code, rec.Body)
	}
}

func TestCrossOriginProtection(t *testing.T) {
	const allowed = "https://game.example"
	newHandler := func(origins ...string) http.Handler {
		return NewServer(fakeDB{}, Services{Auth: auth.NewService(authtest.NewMemStore())}, AuthOptions{DevLogin: true}).Handler(origins)
	}
	h := newHandler(allowed)
	// httptest requests go to Host example.com.
	for _, c := range []struct {
		name         string
		method, path string
		site, origin string
		want         int
	}{
		{"non-browser client (no headers)", "POST", "/auth/dev", "", "", http.StatusOK},
		{"the app itself", "POST", "/auth/dev", "same-origin", "http://example.com", http.StatusOK},
		{"another site", "POST", "/auth/dev", "cross-site", "https://evil.example", http.StatusForbidden},
		{"a sibling subdomain", "POST", "/auth/dev", "same-site", "https://evil.game.example", http.StatusForbidden},
		{"an allowed origin", "POST", "/auth/dev", "cross-site", allowed, http.StatusOK},
		{"old browser, same origin", "POST", "/auth/dev", "", "http://example.com", http.StatusOK},
		{"old browser, another site", "POST", "/auth/dev", "", "https://evil.example", http.StatusForbidden},
		{"a sandboxed page", "POST", "/auth/dev", "", "null", http.StatusForbidden},
		{"reads aren't checked", "GET", "/auth/config", "cross-site", "https://evil.example", http.StatusOK},
	} {
		t.Run(c.name, func(t *testing.T) {
			var body *strings.Reader
			if c.method == "POST" {
				body = strings.NewReader(`{"name":"asha"}`)
			} else {
				body = strings.NewReader("")
			}
			req := httptest.NewRequest(c.method, c.path, body)
			req.Header.Set("Content-Type", "application/json")
			if c.site != "" {
				req.Header.Set("Sec-Fetch-Site", c.site)
			}
			if c.origin != "" {
				req.Header.Set("Origin", c.origin)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("code %d, want %d (%s)", rec.Code, c.want, rec.Body)
			}
			if c.want == http.StatusForbidden && decode[Error](t, rec).Error != "cross_origin" {
				t.Errorf("body %s", rec.Body)
			}
		})
	}

	// "*" lets any site read (CORS) but is never trusted to write.
	req := httptest.NewRequest("POST", "/auth/dev", strings.NewReader(`{"name":"asha"}`))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	newHandler("*").ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf(`with "*": code %d, want 403`, rec.Code)
	}
}

// Login CSRF: a page elsewhere auto-submits a text/plain form holding the attacker's own
// Google token, shaped as JSON. SameSite=Lax doesn't stop the response's Set-Cookie, so
// without the check the visitor would end up signed in as the attacker.
func TestFormFromAnotherSiteCantSignYouIn(t *testing.T) {
	h := NewServer(fakeDB{}, Services{Auth: auth.NewService(authtest.NewMemStore())}, googleOpts()).Handler([]string{"https://game.example"})
	form := func() *http.Request {
		// <input name='{"credential":"valid:sub-9:Mallory","x":"' value='"}'> in a text/plain form.
		req := httptest.NewRequest("POST", "/auth/google", strings.NewReader(`{"credential":"valid:sub-9:Mallory","x":"="}`))
		req.Header.Set("Content-Type", "text/plain")
		return req
	}

	// The body alone is accepted (this is what made the attack work)...
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, form())
	if rec.Code != http.StatusOK {
		t.Fatalf("the form body itself: %d %s", rec.Code, rec.Body)
	}

	// ...but not from a browser on another site.
	req := form()
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("from another site: %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Header().Get("Set-Cookie"), sessionCookie) {
		t.Error("a refused sign-in must not set the session cookie")
	}
}
