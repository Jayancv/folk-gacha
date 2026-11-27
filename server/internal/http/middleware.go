package httpapi

import (
	"log/slog"
	"net/http"
	"slices"
)

// maxBodyBytes caps a request body. The largest real one (a Google ID token, or a push
// subscription) is a few KiB; without a cap one request could make the server read an
// unbounded body into memory.
const maxBodyBytes = 64 << 10

// withBodyLimit stops reading a body after maxBodyBytes; the JSON decoding then fails
// with *http.MaxBytesError, which the request error handler answers with 413.
func withBodyLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		next.ServeHTTP(w, r)
	})
}

// withCrossOriginProtection refuses state-changing requests (POST, PUT, DELETE, …) that a
// browser sends from another site, so no page elsewhere can act with the player's cookie:
// SameSite=Lax keeps the cookie off such requests, but not off the response's Set-Cookie,
// so a form posting an attacker's Google token to /auth/google could sign a visitor into
// the attacker's account. Same-origin requests (the app through its /api rewrite) and
// non-browser clients pass; cross-origin ones only from allowedOrigins ("*" is never
// trusted for writes). Reads aren't checked: CORS keeps their answers from other sites.
// Uses net/http's CrossOriginProtection (Sec-Fetch-Site, else Origin against Host).
func withCrossOriginProtection(allowedOrigins []string, next http.Handler) http.Handler {
	p := http.NewCrossOriginProtection()
	for _, o := range allowedOrigins {
		if o == "*" {
			continue
		}
		if err := p.AddTrustedOrigin(o); err != nil {
			slog.Warn("ALLOWED_ORIGINS: origin skipped (want scheme://host[:port])", "origin", o, "err", err)
		}
	}
	p.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusForbidden, "cross_origin", "Requests from other sites aren't allowed.")
	}))
	return p.Handler(next)
}

// withCORS lets the web app call the API from a different origin
// (e.g. Vercel web + Fly.io API). Use "*" to allow any origin.
func withCORS(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (slices.Contains(allowedOrigins, "*") || slices.Contains(allowedOrigins, origin)) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
