package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/auth/authtest"
)

type testServer struct {
	h  http.Handler
	db *authtest.MemStore
}

func newTestServer(opts AuthOptions) testServer {
	db := authtest.NewMemStore()
	return testServer{h: NewServer(fakeDB{}, Services{Auth: auth.NewService(db)}, opts).Handler(nil), db: db}
}

func googleOpts() AuthOptions {
	return AuthOptions{GoogleClientID: "client-123", Verifier: authtest.FakeGoogle{}}
}

// do sends a request, optionally with a session cookie, and returns the recorder.
func (ts testServer) do(t *testing.T, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	ts.h.ServeHTTP(rec, req)
	return rec
}

func sessionFrom(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookie {
			return c
		}
	}
	t.Fatalf("no %s cookie in response (headers %v)", sessionCookie, rec.Header())
	return nil
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

func TestAuthConfig(t *testing.T) {
	cfg := decode[AuthConfig](t, newTestServer(googleOpts()).do(t, "GET", "/auth/config", "", nil))
	if cfg.GoogleClientId == nil || *cfg.GoogleClientId != "client-123" || cfg.DevLogin {
		t.Fatalf("config = %+v", cfg)
	}
	cfg = decode[AuthConfig](t, newTestServer(AuthOptions{DevLogin: true}).do(t, "GET", "/auth/config", "", nil))
	if cfg.GoogleClientId != nil || !cfg.DevLogin {
		t.Fatalf("config = %+v", cfg)
	}
}

func TestGoogleSignInFlow(t *testing.T) {
	ts := newTestServer(googleOpts())

	rec := ts.do(t, "POST", "/auth/google", `{"credential":"valid:sub-1:Asha Perera"}`, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("sign-in: %d %s", rec.Code, rec.Body)
	}
	me := decode[Me](t, rec)
	if me.Username != "asha_perera" {
		t.Fatalf("username = %q", me.Username)
	}
	cookie := sessionFrom(t, rec)
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Secure || cookie.Path != "/" {
		t.Fatalf("cookie flags: %+v", cookie)
	}
	if strings.Contains(rec.Body.String(), cookie.Value) {
		t.Fatal("the session token must only travel in the HttpOnly cookie")
	}

	rec = ts.do(t, "GET", "/me", "", cookie)
	if rec.Code != http.StatusOK || decode[Me](t, rec).Id != me.Id {
		t.Fatalf("/me with cookie: %d %s", rec.Code, rec.Body)
	}

	// Signing in again with the same Google account returns the same player.
	rec = ts.do(t, "POST", "/auth/google", `{"credential":"valid:sub-1:Renamed"}`, nil)
	if decode[Me](t, rec).Id != me.Id || len(ts.db.Users()) != 1 {
		t.Fatalf("second sign-in created another account: %s", rec.Body)
	}
}

func TestGoogleSignInRejectsBadTokens(t *testing.T) {
	ts := newTestServer(googleOpts())
	for _, body := range []string{`{"credential":"forged"}`, `{"credential":""}`} {
		rec := ts.do(t, "POST", "/auth/google", body, nil)
		if rec.Code != http.StatusUnauthorized || decode[Error](t, rec).Error != "invalid_token" {
			t.Fatalf("%s: %d %s", body, rec.Code, rec.Body)
		}
		if len(rec.Result().Cookies()) != 0 {
			t.Fatal("no cookie on a failed sign-in")
		}
	}
	if len(ts.db.Users()) != 0 {
		t.Fatal("no account may be created from a bad token")
	}
}

func TestGoogleSignInDisabledWithoutClientID(t *testing.T) {
	rec := newTestServer(AuthOptions{}).do(t, "POST", "/auth/google", `{"credential":"valid:1:x"}`, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("code = %d", rec.Code)
	}
}

func TestMeRequiresAValidSession(t *testing.T) {
	ts := newTestServer(googleOpts())
	for name, c := range map[string]*http.Cookie{
		"no cookie":     nil,
		"forged cookie": {Name: sessionCookie, Value: auth.NewToken()},
	} {
		rec := ts.do(t, "GET", "/me", "", c)
		if rec.Code != http.StatusUnauthorized || decode[Error](t, rec).Error != "not_signed_in" {
			t.Fatalf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
}

func TestLogout(t *testing.T) {
	ts := newTestServer(googleOpts())
	cookie := sessionFrom(t, ts.do(t, "POST", "/auth/google", `{"credential":"valid:s:Asha"}`, nil))

	rec := ts.do(t, "POST", "/auth/logout", "", cookie)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("logout: %d", rec.Code)
	}
	if cleared := sessionFrom(t, rec); cleared.MaxAge >= 0 || cleared.Value != "" {
		t.Fatalf("logout must clear the cookie: %+v", cleared)
	}
	if ts.db.SessionCount() != 0 {
		t.Fatal("logout must delete the session server-side")
	}
	// The old cookie no longer works, even if a client keeps sending it.
	if rec := ts.do(t, "GET", "/me", "", cookie); rec.Code != http.StatusUnauthorized {
		t.Fatalf("/me after logout: %d", rec.Code)
	}
	// Logging out without a session is harmless.
	if rec := ts.do(t, "POST", "/auth/logout", "", nil); rec.Code != http.StatusNoContent {
		t.Fatalf("logout without session: %d", rec.Code)
	}
}

func TestDevSignIn(t *testing.T) {
	off := newTestServer(googleOpts())
	if rec := off.do(t, "POST", "/auth/dev", `{"name":"asha"}`, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("dev login must be off by default: %d", rec.Code)
	}

	ts := newTestServer(AuthOptions{DevLogin: true})
	rec := ts.do(t, "POST", "/auth/dev", `{"name":"Asha"}`, nil)
	if rec.Code != http.StatusOK || decode[Me](t, rec).Username != "asha" {
		t.Fatalf("dev sign-in: %d %s", rec.Code, rec.Body)
	}
	// Same name, any case: same test player.
	again := ts.do(t, "POST", "/auth/dev", `{"name":"ASHA"}`, nil)
	if decode[Me](t, again).Id != decode[Me](t, rec).Id {
		t.Fatal("dev names should map to one player each")
	}
	if rec := ts.do(t, "POST", "/auth/dev", `{"name":"!!"}`, nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("unusable name: %d", rec.Code)
	}
}

func TestSecureCookiesOutsideDev(t *testing.T) {
	opts := googleOpts()
	opts.SecureCookies = true
	cookie := sessionFrom(t, newTestServer(opts).do(t, "POST", "/auth/google", `{"credential":"valid:s:Asha"}`, nil))
	if !cookie.Secure {
		t.Fatal("production cookies must be Secure")
	}
}

func TestDatabaseOutageIsNotLeaked(t *testing.T) {
	ts := newTestServer(googleOpts())
	ts.db.Fail = errors.New("pq: password authentication failed for user cardgame")

	rec := ts.do(t, "POST", "/auth/google", `{"credential":"valid:s:Asha"}`, nil)
	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "password") {
		t.Fatalf("internal errors must be generic: %d %s", rec.Code, rec.Body)
	}
	// A session lookup failure is "try again", not "you're signed out".
	rec = ts.do(t, "GET", "/me", "", &http.Cookie{Name: sessionCookie, Value: "x"})
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("/me during outage: %d %s", rec.Code, rec.Body)
	}
}
