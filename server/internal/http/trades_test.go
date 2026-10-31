package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"testing"

	"github.com/google/uuid"

	"cardgame/server/internal/auth"
	"cardgame/server/internal/collection"
	"cardgame/server/internal/dbtest"
	"cardgame/server/internal/merges"
	"cardgame/server/internal/seeding"
	"cardgame/server/internal/store"
	"cardgame/server/internal/trades"
	"cardgame/server/seasons"
	"cardgame/server/seed"
)

func TestTradesNeedSignIn(t *testing.T) {
	ts := newTestServer(AuthOptions{DevLogin: true})
	id := uuid.New()
	for _, r := range []struct{ method, path, body string }{
		{"GET", "/trades", ""},
		{"POST", "/trades", fmt.Sprintf(`{"to":"ben","offer":["%s"],"request":["%s"]}`, uuid.New(), uuid.New())},
		{"POST", "/trades/" + id.String() + "/accept", ""},
		{"POST", "/trades/" + id.String() + "/decline", ""},
		{"POST", "/trades/" + id.String() + "/cancel", ""},
		{"GET", "/users/ben/cards", ""},
	} {
		if rec := ts.do(t, r.method, r.path, r.body, nil); rec.Code != 401 {
			t.Errorf("%s %s signed out: %d %s", r.method, r.path, rec.Code, rec.Body)
		}
	}
}

// End to end against Postgres (skipped unless TEST_DATABASE_URL is set).
func TestTradeOverHTTP(t *testing.T) {
	pool := dbtest.Pool(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "TRUNCATE users, cards, trades, daily_claims, discovered_recipes CASCADE"); err != nil {
		t.Fatal(err)
	}
	if _, err := seeding.Run(ctx, pool, seeding.Sources{Seasons: seasons.SeedSQL, Recipes: seed.RecipesJSON}); err != nil {
		t.Fatal(err)
	}
	ts := testServer{h: NewServer(pool, Services{
		Auth:       auth.NewService(store.New(pool)),
		Merges:     merges.NewService(pool),
		Collection: collection.NewService(pool),
		Trades:     trades.NewService(pool),
	}, AuthOptions{DevLogin: true}).Handler(nil)}

	signIn := func(name string) (*http.Cookie, uuid.UUID) {
		t.Helper()
		rec := ts.do(t, "POST", "/auth/dev", fmt.Sprintf(`{"name":%q}`, name), nil)
		if rec.Code != 200 {
			t.Fatalf("sign in %s: %d %s", name, rec.Code, rec.Body)
		}
		return sessionFrom(t, rec), decode[Me](t, rec).Id
	}
	ashaCookie, asha := signIn("asha")
	benCookie, ben := signIn("ben")
	give := func(owner uuid.UUID, template string) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		err := pool.QueryRow(ctx, `WITH sc AS (
				UPDATE season_cards SET minted = minted + 1
				WHERE id = (SELECT min(id) FROM season_cards WHERE template_id = $1) RETURNING id, minted)
			INSERT INTO cards (season_card_id, copy_no, owner_id, acquired_via)
			SELECT id, minted, $2, 'pack' FROM sc RETURNING id`, template, owner).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	a1, a2, b1 := give(asha, "gaja-calf"), give(asha, "gaja-calf"), give(ben, "simha")
	body := fmt.Sprintf(`{"to":"Ben","offer":["%s"],"request":["%s"]}`, a1, b1)

	// Brand-new accounts can't trade yet.
	if rec := ts.do(t, "POST", "/trades", body, ashaCookie); rec.Code != 403 || decode[Error](t, rec).Error != "trade_locked" {
		t.Fatalf("new account: %d %s", rec.Code, rec.Body)
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET trade_unlocked_at = now() - interval '1 hour'"); err != nil {
		t.Fatal(err)
	}

	// Asha browses Ben's cards to pick what to ask for.
	rec := ts.do(t, "GET", "/users/BEN/cards", "", ashaCookie)
	if rec.Code != 200 {
		t.Fatalf("ben's cards: %d %s", rec.Code, rec.Body)
	}
	if page := decode[CardPage](t, rec); page.Total != 1 || page.Cards[0].Id != b1 || page.Cards[0].InTrade {
		t.Fatalf("ben's cards %+v", page)
	}
	if rec := ts.do(t, "GET", "/users/nobody/cards", "", ashaCookie); rec.Code != 404 {
		t.Fatalf("unknown player's cards: %d", rec.Code)
	}

	rec = ts.do(t, "POST", "/trades", body, ashaCookie)
	if rec.Code != 201 {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	tr := decode[Trade](t, rec)
	if tr.Direction != "outgoing" || tr.From != "asha" || tr.To != "ben" || tr.Status != "open" ||
		len(tr.Offer) != 1 || tr.Offer[0].Card == nil || !tr.Offer[0].Card.InTrade {
		t.Fatalf("created %+v", tr)
	}

	// The offered card is locked.
	merge := ts.do(t, "POST", "/merges", fmt.Sprintf(`{"cardIds":["%s","%s"]}`, a2, a1), ashaCookie)
	if merge.Code != 409 || decode[Error](t, merge).Error != "in_trade" {
		t.Fatalf("merge a locked card: %d %s", merge.Code, merge.Body)
	}
	// Bad requests map to their codes.
	for _, c := range []struct {
		body string
		code int
		err  string
	}{
		{fmt.Sprintf(`{"to":"ben","offer":["%s"],"request":[]}`, a2), 400, "bad_offer"}, // a gift
		{fmt.Sprintf(`{"to":"asha","offer":["%s"],"request":["%s"]}`, a2, b1), 400, "self_trade"},
		{fmt.Sprintf(`{"to":"nobody","offer":["%s"],"request":["%s"]}`, a2, b1), 404, "not_found"},
		{fmt.Sprintf(`{"to":"ben","offer":["%s"],"request":["%s"]}`, a1, b1), 409, "in_trade"},
		{fmt.Sprintf(`{"to":"ben","offer":["%s"],"request":["%s"]}`, b1, a2), 409, "not_owned"},
	} {
		rec := ts.do(t, "POST", "/trades", c.body, ashaCookie)
		if rec.Code != c.code || decode[Error](t, rec).Error != c.err {
			t.Errorf("%s: %d %s, want %d %s", c.body, rec.Code, rec.Body, c.code, c.err)
		}
	}

	// Ben sees it as incoming; Asha can't accept her own offer.
	list := decode[TradeList](t, ts.do(t, "GET", "/trades", "", benCookie))
	if len(list.Trades) != 1 || list.Trades[0].Direction != "incoming" {
		t.Fatalf("ben's list %+v", list)
	}
	if rec := ts.do(t, "POST", "/trades/"+tr.Id.String()+"/accept", "", ashaCookie); rec.Code != 404 {
		t.Fatalf("sender accepts: %d", rec.Code)
	}
	rec = ts.do(t, "POST", "/trades/"+tr.Id.String()+"/accept", "", benCookie)
	if rec.Code != 200 {
		t.Fatalf("accept: %d %s", rec.Code, rec.Body)
	}
	done := decode[Trade](t, rec)
	if done.Status != "accepted" || done.ResolvedAt == nil || done.Offer[0].Card.AcquiredVia != "trade" || done.Offer[0].Card.InTrade {
		t.Fatalf("accepted %+v", done)
	}
	// Their first trade together: each gets a gift card, and sees only their own.
	if done.Gift == nil || done.Gift.AcquiredVia != "gift" || done.Gift.Rarity != "common" && done.Gift.Rarity != "uncommon" {
		t.Fatalf("ben's gift %+v", done.Gift)
	}
	ashaList := decode[TradeList](t, ts.do(t, "GET", "/trades", "", ashaCookie))
	if g := ashaList.Trades[0].Gift; g == nil || g.Id == done.Gift.Id {
		t.Fatalf("asha's gift %+v", g)
	}
	rec = ts.do(t, "POST", "/trades/"+tr.Id.String()+"/accept", "", benCookie)
	if rec.Code != 409 || decode[Error](t, rec).Error != "not_open" {
		t.Fatalf("accept twice: %d %s", rec.Code, rec.Body)
	}
	page := decode[CardPage](t, ts.do(t, "GET", "/cards", "", benCookie))
	if page.Total != 2 || !slices.ContainsFunc(page.Cards, func(c Card) bool { return c.Id == a1 }) ||
		!slices.ContainsFunc(page.Cards, func(c Card) bool { return c.Id == done.Gift.Id }) {
		t.Fatalf("ben's cards after the trade (a1 and his gift) %+v", page)
	}
}
