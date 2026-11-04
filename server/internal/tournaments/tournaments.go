// Package tournaments runs tournaments: players enter a lineup of their cards, the
// lineups are scored by the tournament's format when entries close, and the cards stay
// locked until the tournament ends. Entering and withdrawing are one transaction with
// row locks each; a job (Step, Run) creates each series' current tournament, closes and
// scores due ones, and finishes ended ones, safe on several servers and catching up
// missed steps. Rules (schedule, formats, scoring, ties) live in internal/game.
package tournaments

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"cardgame/server/internal/game"
	"cardgame/server/internal/mint"
	"cardgame/server/internal/store"
)

var (
	// ErrNotFound: no such tournament (upcoming ones don't exist yet).
	ErrNotFound = errors.New("tournaments: no such tournament")
	// ErrClosed: entries are closed (lineups are final).
	ErrClosed = errors.New("tournaments: entries are closed")
	// ErrNoEntry: the player hasn't entered this tournament.
	ErrNoEntry = errors.New("tournaments: not entered")
	// ErrNotOwned: a card doesn't exist or isn't the player's.
	ErrNotOwned = errors.New("tournaments: card not owned")
	// ErrInTrade: a card is offered in an open trade.
	ErrInTrade = errors.New("tournaments: card is in an open trade offer")
	// ErrInTournament: a card is in another tournament's lineup.
	ErrInTournament = errors.New("tournaments: card is in another tournament")
	// ErrCooldown: a card was in the series' previous tournament, so it sits this one out.
	ErrCooldown = errors.New("tournaments: card was in the previous tournament")
)

// game.ErrLineupSize, ErrLineupDuplicate, ErrLineupRarity, ErrLineupSpirit and
// ErrLineupTradedLate (wrapped) are returned for lineups the format doesn't allow.

// ResultsShown is how many places a tournament's results list.
const ResultsShown = 100

// History is how long finished tournaments stay in the list.
const History = 7 * 24 * time.Hour

// Service runs tournaments.
type Service struct {
	pool *pgxpool.Pool
	// Now is replaceable in tests.
	Now func() time.Time
	// Seeds makes each tournament's tie-break seed (crypto/rand by default).
	Seeds io.Reader
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, Now: time.Now, Seeds: rand.Reader}
}

// Tournament is a stored tournament.
type Tournament struct {
	game.Tournament
	// Name is the series name.
	Name    string
	Status  string
	Entries int
	// SeedHash is published from the start; Seed only once entries close.
	SeedHash string
	Seed     []byte
	// Entered: the viewer has an entry (List only).
	Entered bool
}

// Upcoming is a series' next tournament (not stored yet).
type Upcoming struct {
	game.Tournament
	Name string
}

// EntryCard is one card of a lineup. Card is nil if the card no longer exists.
type EntryCard struct {
	CardID uuid.UUID
	Card   *store.GetOwnedCardsRow
}

// Entry is a player's lineup, with its score once entries close.
type Entry struct {
	Cards []EntryCard
	// Score: the server's preview while open, the final score once locked.
	Score game.LineupScore
	// Rank once entries close (0 before).
	Rank int
}

// Result is one place in a tournament's results.
type Result struct {
	Rank     int
	UserID   uuid.UUID
	Username string
	Score    int
}

// Detail is a tournament with the viewer's entry and, once closed, the results.
type Detail struct {
	Tournament
	You     *Entry
	Results []Result
}

// ensure creates each series' tournament for the period containing now.
func (s *Service) ensure(ctx context.Context, q *store.Queries, now time.Time) error {
	for _, series := range game.TournamentSeries {
		t := series.TournamentAt(now)
		format, err := json.Marshal(t.Format)
		if err != nil {
			return err
		}
		seed := make([]byte, 32)
		if _, err := io.ReadFull(s.Seeds, seed); err != nil {
			return err
		}
		if err := q.EnsureTournament(ctx, store.EnsureTournamentParams{
			ID: t.ID, Series: t.Series, N: int32(t.N), Name: series.Name, Format: format,
			Element: pgtype.Text{String: t.Element, Valid: t.Element != ""},
			OpensAt: t.OpensAt, ClosesAt: t.ClosesAt, EndsAt: t.EndsAt,
			Seed: seed, SeedHash: game.SeedHash(seed), Prizes: toInt32s(t.Prizes),
		}); err != nil {
			return err
		}
	}
	return nil
}

// List returns the current tournaments, those that ended in the last History (newest
// first), and each series' next tournament.
func (s *Service) List(ctx context.Context, viewer uuid.UUID) ([]Tournament, []Upcoming, error) {
	now := s.Now()
	q := store.New(s.pool)
	if err := s.ensure(ctx, q, now); err != nil {
		return nil, nil, err
	}
	rows, err := q.ListTournaments(ctx, now.Add(-History))
	if err != nil {
		return nil, nil, err
	}
	out := make([]Tournament, 0, len(rows))
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		t, err := toTournament(store.GetTournamentRow(r))
		if err != nil {
			return nil, nil, err
		}
		out = append(out, t)
		ids = append(ids, t.ID)
	}
	entered, err := q.ListEnteredTournaments(ctx, store.ListEnteredTournamentsParams{UserID: viewer, Ids: ids})
	if err != nil {
		return nil, nil, err
	}
	for i := range out {
		out[i].Entered = slices.Contains(entered, out[i].ID)
	}
	var next []Upcoming
	for _, series := range game.TournamentSeries {
		next = append(next, Upcoming{Tournament: series.Next(series.TournamentAt(now)), Name: series.Name})
	}
	return out, next, nil
}

// Get returns a tournament with the viewer's entry and, once entries closed, the results.
func (s *Service) Get(ctx context.Context, viewer uuid.UUID, id string) (Detail, error) {
	q := store.New(s.pool)
	if err := s.ensure(ctx, q, s.Now()); err != nil {
		return Detail{}, err
	}
	row, err := q.GetTournament(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, ErrNotFound
	}
	if err != nil {
		return Detail{}, err
	}
	t, err := toTournament(row)
	if err != nil {
		return Detail{}, err
	}
	d := Detail{Tournament: t}
	if d.You, err = s.entry(ctx, q, t, viewer); err != nil {
		return Detail{}, err
	}
	if t.Status == game.TournamentOpen {
		return d, nil
	}
	results, err := q.ListTournamentResults(ctx, store.ListTournamentResultsParams{TournamentID: id, MaxRows: ResultsShown})
	if err != nil {
		return Detail{}, err
	}
	d.Results = make([]Result, len(results))
	for i, r := range results {
		d.Results[i] = Result{Rank: int(r.Rank.Int32), UserID: r.UserID, Username: r.Username, Score: int(r.Score.Int32)}
	}
	return d, nil
}

// entry is the player's lineup in t, or nil if they haven't entered.
func (s *Service) entry(ctx context.Context, q *store.Queries, t Tournament, user uuid.UUID) (*Entry, error) {
	e, err := q.GetEntry(ctx, store.GetEntryParams{TournamentID: t.ID, UserID: user})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := q.ListEntryCards(ctx, store.ListEntryCardsParams{TournamentID: t.ID, UserID: user})
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(rows))
	for i, r := range rows {
		ids[i] = r.CardID
	}
	cards, err := q.GetOwnedCards(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]*store.GetOwnedCardsRow, len(cards))
	for i := range cards {
		byID[cards[i].ID] = &cards[i]
	}
	out := &Entry{Rank: int(e.Rank.Int32)}
	for _, id := range ids {
		out.Cards = append(out.Cards, EntryCard{CardID: id, Card: byID[id]})
	}
	if e.Breakdown != nil {
		// Final: the score saved when entries closed.
		if err := json.Unmarshal(e.Breakdown, &out.Score); err != nil {
			return nil, fmt.Errorf("tournament %s entry breakdown: %w", t.ID, err)
		}
		return out, nil
	}
	// Still open: score the lineup as it stands (cards are locked in it, so they're all there).
	lineup, err := lineupCards(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	out.Score = t.Score(lineup)
	return out, nil
}

// Enter saves the player's lineup (replacing any earlier one) while entries are open.
// The cards are locked in the tournament until it ends; cards swapped out are freed.
func (s *Service) Enter(ctx context.Context, user uuid.UUID, id string, cardIDs []uuid.UUID) (Entry, error) {
	now := s.Now()
	if err := s.ensure(ctx, store.New(s.pool), now); err != nil {
		return Entry{}, err
	}
	var t Tournament
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		var err error
		if t, err = s.openForEntry(ctx, q, user, id, now); err != nil {
			return err
		}
		// Lock the new lineup and the old one together, in id order.
		old, err := q.ListEntryCards(ctx, store.ListEntryCardsParams{TournamentID: id, UserID: user})
		if err != nil {
			return err
		}
		all := slices.Clone(cardIDs)
		for _, c := range old {
			all = append(all, c.CardID)
		}
		if err := q.LockCardRows(ctx, all); err != nil {
			return err
		}
		if _, err := s.checkLineup(ctx, q, t, user, cardIDs); err != nil {
			return err
		}
		if err := q.UnlockPlayerTournamentCards(ctx, store.UnlockPlayerTournamentCardsParams{TournamentID: id, OwnerID: user, Keep: cardIDs}); err != nil {
			return err
		}
		if err := q.SaveEntry(ctx, store.SaveEntryParams{TournamentID: id, UserID: user, Now: now}); err != nil {
			return err
		}
		if err := q.ClearEntryCards(ctx, store.ClearEntryCardsParams{TournamentID: id, UserID: user}); err != nil {
			return err
		}
		if err := q.AddEntryCards(ctx, store.AddEntryCardsParams{TournamentID: id, UserID: user, CardIds: cardIDs}); err != nil {
			return err
		}
		return q.LockCardsInTournament(ctx, store.LockCardsInTournamentParams{TournamentID: id, Ids: cardIDs})
	})
	if err != nil {
		return Entry{}, err
	}
	e, err := s.entry(ctx, store.New(s.pool), t, user)
	if err != nil {
		return Entry{}, err
	}
	return *e, nil
}

// Withdraw removes the player's entry while entries are open and frees its cards.
func (s *Service) Withdraw(ctx context.Context, user uuid.UUID, id string) error {
	now := s.Now()
	if err := s.ensure(ctx, store.New(s.pool), now); err != nil {
		return err
	}
	return mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		if _, err := s.openForEntry(ctx, q, user, id, now); err != nil {
			return err
		}
		old, err := q.ListEntryCards(ctx, store.ListEntryCardsParams{TournamentID: id, UserID: user})
		if err != nil {
			return err
		}
		ids := make([]uuid.UUID, len(old))
		for i, c := range old {
			ids[i] = c.CardID
		}
		if err := q.LockCardRows(ctx, ids); err != nil {
			return err
		}
		if err := q.UnlockPlayerTournamentCards(ctx, store.UnlockPlayerTournamentCardsParams{TournamentID: id, OwnerID: user, Keep: []uuid.UUID{}}); err != nil {
			return err
		}
		n, err := q.DeleteEntry(ctx, store.DeleteEntryParams{TournamentID: id, UserID: user})
		if err != nil {
			return err
		}
		if n == 0 {
			return ErrNoEntry
		}
		return nil
	})
}

// Preview scores a lineup as Enter would, without saving or locking anything, so the
// app never computes scores itself.
func (s *Service) Preview(ctx context.Context, user uuid.UUID, id string, cardIDs []uuid.UUID) (game.LineupScore, error) {
	q := store.New(s.pool)
	if err := s.ensure(ctx, q, s.Now()); err != nil {
		return game.LineupScore{}, err
	}
	row, err := q.GetTournament(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return game.LineupScore{}, ErrNotFound
	}
	if err != nil {
		return game.LineupScore{}, err
	}
	t, err := toTournament(row)
	if err != nil {
		return game.LineupScore{}, err
	}
	if t.Status != game.TournamentOpen || !s.Now().Before(t.ClosesAt) {
		return game.LineupScore{}, ErrClosed
	}
	lineup, err := s.checkLineup(ctx, q, t, user, cardIDs)
	if err != nil {
		return game.LineupScore{}, err
	}
	return t.Score(lineup), nil
}

// openForEntry share-locks the tournament (so closing waits for this transaction) and
// the player's row (so two saves of one player's lineup run one at a time), and checks
// that entries are open. (The caller ensures the current tournaments first, outside its
// transaction, so a refused entry doesn't roll their creation back.)
func (s *Service) openForEntry(ctx context.Context, q *store.Queries, user uuid.UUID, id string, now time.Time) (Tournament, error) {
	lock, err := q.ShareLockTournament(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Tournament{}, ErrNotFound
	}
	if err != nil {
		return Tournament{}, err
	}
	if lock.Status != game.TournamentOpen || !now.Before(lock.ClosesAt) {
		return Tournament{}, ErrClosed
	}
	if _, err := q.LockTrader(ctx, user); err != nil {
		return Tournament{}, err
	}
	row, err := q.GetTournament(ctx, id)
	if err != nil {
		return Tournament{}, err
	}
	return toTournament(row)
}

// checkLineup checks the cards for the player's lineup in t: theirs, not in a trade
// offer or another tournament, not in the series' previous tournament, and allowed by
// the format. It returns the cards in the lineup's order.
func (s *Service) checkLineup(ctx context.Context, q *store.Queries, t Tournament, user uuid.UUID, cardIDs []uuid.UUID) ([]game.LineupCard, error) {
	// The format's own rules first (size, duplicates), so a bad list gets the clearer error.
	if len(cardIDs) < game.MinLineupCards || len(cardIDs) > t.Format.Slots {
		return nil, fmt.Errorf("%w: %d, want %d-%d", game.ErrLineupSize, len(cardIDs), game.MinLineupCards, t.Format.Slots)
	}
	rows, err := q.ListLineupCards(ctx, cardIDs)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]store.ListLineupCardsRow, len(rows))
	for _, r := range rows {
		byID[r.ID] = r
	}
	lineup := make([]game.LineupCard, 0, len(cardIDs))
	for _, id := range cardIDs {
		r, ok := byID[id]
		if !ok || r.OwnerID != user {
			return nil, ErrNotOwned
		}
		if r.LockedInTradeID.Valid {
			return nil, ErrInTrade
		}
		if r.LockedInTournamentID.Valid && r.LockedInTournamentID.String != t.ID {
			return nil, ErrInTournament
		}
		lineup = append(lineup, toLineupCard(r))
	}
	if err := t.CheckLineup(lineup); err != nil {
		return nil, err
	}
	if series, ok := seriesOf(t.Series); ok {
		used, err := q.CardsInTournament(ctx, store.CardsInTournamentParams{TournamentID: series.Previous(t.Tournament).ID, CardIds: cardIDs})
		if err != nil {
			return nil, err
		}
		if len(used) > 0 {
			return nil, ErrCooldown
		}
	}
	return lineup, nil
}

// Step runs the job once: creates the current tournaments, closes and scores those
// whose entries are due to close, then finishes those that ended (in that order, so a
// tournament missed entirely is closed before it is finished). It returns the ids it moved on.
func (s *Service) Step(ctx context.Context) (closed, finished []string, err error) {
	now := s.Now()
	q := store.New(s.pool)
	if err := s.ensure(ctx, q, now); err != nil {
		return nil, nil, err
	}
	due, err := q.ListTournamentsToClose(ctx, now)
	if err != nil {
		return nil, nil, err
	}
	for _, id := range due {
		ok, err := s.close(ctx, id)
		if err != nil {
			return closed, finished, err
		}
		if ok {
			closed = append(closed, id)
		}
	}
	ended, err := q.ListTournamentsToFinish(ctx, now)
	if err != nil {
		return closed, finished, err
	}
	for _, id := range ended {
		ok, err := s.finish(ctx, id)
		if err != nil {
			return closed, finished, err
		}
		if ok {
			finished = append(finished, id)
		}
	}
	return closed, finished, nil
}

// close snapshots and scores every lineup, ranks them, and locks the tournament. It
// reports false when another server got there first.
func (s *Service) close(ctx context.Context, id string) (bool, error) {
	var entries, prizes int
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		entries, prizes = 0, 0
		row, err := q.LockTournamentToStep(ctx, store.LockTournamentToStepParams{ID: id, Status: game.TournamentOpen})
		if err != nil {
			return err
		}
		t, err := toTournament(store.GetTournamentRow{
			ID: row.ID, Series: row.Series, N: row.N, Name: row.Name, Format: row.Format, Element: row.Element,
			OpensAt: row.OpensAt, ClosesAt: row.ClosesAt, EndsAt: row.EndsAt, Status: row.Status, Seed: row.Seed, SeedHash: row.SeedHash,
			Prizes: row.Prizes,
		})
		if err != nil {
			return err
		}
		users, err := q.ListEntryUsers(ctx, id)
		if err != nil {
			return err
		}
		entries = len(users)
		slots, err := q.ListAllEntryCards(ctx, id)
		if err != nil {
			return err
		}
		lineups := map[uuid.UUID][]uuid.UUID{}
		var all []uuid.UUID
		for _, sl := range slots {
			lineups[sl.UserID] = append(lineups[sl.UserID], sl.CardID)
			all = append(all, sl.CardID)
		}
		rows, err := q.ListLineupCards(ctx, all)
		if err != nil {
			return err
		}
		byID := make(map[uuid.UUID]store.ListLineupCardsRow, len(rows))
		for _, r := range rows {
			byID[r.ID] = r
		}
		totals := make([]game.EntryTotal, 0, len(users))
		scores := make(map[string]game.LineupScore, len(users))
		for _, u := range users {
			// Locked cards can't be merged or traded, but a deleted account's cards are gone:
			// a lineup scores the cards still there.
			var lineup []game.LineupCard
			for _, cid := range lineups[u] {
				r, ok := byID[cid]
				if !ok {
					continue
				}
				c := toLineupCard(r)
				snap, err := json.Marshal(c)
				if err != nil {
					return err
				}
				if err := q.SetEntrySnapshot(ctx, store.SetEntrySnapshotParams{TournamentID: id, CardID: cid, Snapshot: snap}); err != nil {
					return err
				}
				lineup = append(lineup, c)
			}
			sc := t.Score(lineup)
			scores[u.String()] = sc
			totals = append(totals, game.EntryTotal{UserID: u.String(), Total: sc.Total})
		}
		// The seed itself (Tournament.Seed is only filled once it's public).
		for _, r := range game.RankEntries(totals, row.Seed) {
			breakdown, err := json.Marshal(scores[r.UserID])
			if err != nil {
				return err
			}
			user := uuid.MustParse(r.UserID)
			if err := q.ScoreEntry(ctx, store.ScoreEntryParams{
				TournamentID: id, UserID: user, Breakdown: breakdown,
				Score: pgtype.Int4{Int32: int32(r.Total), Valid: true}, Rank: pgtype.Int4{Int32: int32(r.Rank), Valid: true},
			}); err != nil {
				return err
			}
			// Prizes in the same transaction as the ranks, so a place wins its cards exactly
			// once (a second server finds the tournament locked and skips it).
			if n := t.PrizeFor(r.Rank); n > 0 {
				if err := q.AddTournamentPrizes(ctx, store.AddTournamentPrizesParams{
					TournamentID: id, UserID: user, Place: int32(r.Rank), CreatedAt: s.Now(), Cards: int32(n),
				}); err != nil {
					return err
				}
				prizes += n
			}
		}
		return q.SetTournamentStatus(ctx, store.SetTournamentStatusParams{ID: id, Status: game.TournamentLocked})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	slog.InfoContext(ctx, "tournament closed", "tournament", id, "entries", entries, "prizeCards", prizes)
	return true, nil
}

// finish frees the tournament's cards. It reports false when another server got there first.
func (s *Service) finish(ctx context.Context, id string) (bool, error) {
	var freed int64
	err := mint.InTx(ctx, s.pool, func(q *store.Queries) error {
		if _, err := q.LockTournamentToStep(ctx, store.LockTournamentToStepParams{ID: id, Status: game.TournamentLocked}); err != nil {
			return err
		}
		var err error
		if freed, err = q.UnlockTournamentCards(ctx, id); err != nil {
			return err
		}
		return q.SetTournamentStatus(ctx, store.SetTournamentStatusParams{ID: id, Status: game.TournamentFinished})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	slog.InfoContext(ctx, "tournament finished", "tournament", id, "cardsFreed", freed)
	return true, nil
}

// Run calls Step now and then every `every` until ctx is done. Errors are logged and
// retried on the next tick.
func (s *Service) Run(ctx context.Context, every time.Duration) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		if _, _, err := s.Step(ctx); err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "tournament step failed", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func seriesOf(id string) (game.Series, bool) {
	for _, s := range game.TournamentSeries {
		if s.ID == id {
			return s, true
		}
	}
	return game.Series{}, false
}

func toTournament(r store.GetTournamentRow) (Tournament, error) {
	var f game.Format
	if err := json.Unmarshal(r.Format, &f); err != nil {
		return Tournament{}, fmt.Errorf("tournament %s format: %w", r.ID, err)
	}
	t := Tournament{
		Tournament: game.Tournament{
			ID: r.ID, Series: r.Series, N: int(r.N), Format: f, Element: r.Element.String,
			OpensAt: r.OpensAt, ClosesAt: r.ClosesAt, EndsAt: r.EndsAt, Prizes: toInts(r.Prizes),
		},
		Name:     r.Name,
		Status:   r.Status,
		Entries:  int(r.Entries),
		SeedHash: r.SeedHash,
	}
	if r.Status != game.TournamentOpen {
		t.Seed = r.Seed
	}
	return t, nil
}

func toInt32s(v []int) []int32 {
	out := make([]int32, len(v))
	for i, n := range v {
		out[i] = int32(n)
	}
	return out
}

func toInts(v []int32) []int {
	out := make([]int, len(v))
	for i, n := range v {
		out[i] = int(n)
	}
	return out
}

func toLineupCard(r store.ListLineupCardsRow) game.LineupCard {
	return game.LineupCard{
		ID: r.ID.String(), Spirit: r.TemplateID, Element: r.Element, Rarity: game.Rarity(r.Rarity),
		Level: int(r.Level), Score: game.LevelScore(int(r.Score), int(r.Level)),
		Traded: r.Traded, AcquiredAt: r.AcquiredAt,
	}
}

// lineupCards reads cards for scoring, in the order of ids (missing ones skipped).
func lineupCards(ctx context.Context, q *store.Queries, ids []uuid.UUID) ([]game.LineupCard, error) {
	rows, err := q.ListLineupCards(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]store.ListLineupCardsRow, len(rows))
	for _, r := range rows {
		byID[r.ID] = r
	}
	out := make([]game.LineupCard, 0, len(ids))
	for _, id := range ids {
		if r, ok := byID[id]; ok {
			out = append(out, toLineupCard(r))
		}
	}
	return out, nil
}
