package httpapi

import "testing"

func TestTutorialIsRecordedOncePerAccount(t *testing.T) {
	ts := newTestServer(AuthOptions{DevLogin: true})
	if rec := ts.do(t, "POST", "/me/tutorial", "", nil); rec.Code != 401 {
		t.Fatalf("signed out: %d", rec.Code)
	}
	signIn := ts.do(t, "POST", "/auth/dev", `{"name":"newbie"}`, nil)
	if decode[Me](t, signIn).TutorialDone {
		t.Fatal("a new player has already done the tutorial")
	}
	cookie := sessionFrom(t, signIn)
	for range 2 { // finishing (or skipping) twice is fine
		if rec := ts.do(t, "POST", "/me/tutorial", "", cookie); rec.Code != 204 {
			t.Fatalf("complete: %d %s", rec.Code, rec.Body)
		}
	}
	if !decode[Me](t, ts.do(t, "GET", "/me", "", cookie)).TutorialDone {
		t.Fatal("tutorial not recorded")
	}
	// Signing in again (another device) keeps it done.
	if !decode[Me](t, ts.do(t, "POST", "/auth/dev", `{"name":"newbie"}`, nil)).TutorialDone {
		t.Fatal("tutorial forgotten on the next sign-in")
	}
}
