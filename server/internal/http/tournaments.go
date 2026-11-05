package httpapi

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"cardgame/server/internal/game"
	"cardgame/server/internal/tournaments"
)

func (s *Server) ListTournaments(ctx context.Context, _ ListTournamentsRequestObject) (ListTournamentsResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return ListTournaments401JSONResponse{Error: "not_signed_in"}, nil
	}
	out := ListTournaments200JSONResponse{Tournaments: []Tournament{}, Upcoming: []Tournament{}}
	if s.tournaments == nil {
		return out, nil
	}
	list, next, err := s.tournaments.List(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	for _, t := range list {
		out.Tournaments = append(out.Tournaments, toTournament(t))
	}
	for _, u := range next {
		out.Upcoming = append(out.Upcoming, toTournament(tournaments.Tournament{Tournament: u.Tournament, Name: u.Name, Status: game.TournamentUpcoming}))
	}
	return out, nil
}

func (s *Server) GetTournament(ctx context.Context, req GetTournamentRequestObject) (GetTournamentResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return GetTournament401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.tournaments == nil {
		return nil, errors.New("tournaments are not configured")
	}
	d, err := s.tournaments.Get(ctx, user.ID, req.TournamentId)
	if errors.Is(err, tournaments.ErrNotFound) {
		return GetTournament404JSONResponse{Error: "not_found", Message: ptr("No such tournament.")}, nil
	}
	if err != nil {
		return nil, err
	}
	d.Entered = d.You != nil
	out := GetTournament200JSONResponse{Tournament: toTournament(d.Tournament), Results: []TournamentResult{}}
	if d.You != nil {
		e, err := toTournamentEntry(*d.You)
		if err != nil {
			return nil, err
		}
		out.You = &e
	}
	for _, r := range d.Results {
		out.Results = append(out.Results, TournamentResult{Rank: r.Rank, Username: r.Username, Score: r.Score})
	}
	return out, nil
}

func (s *Server) EnterTournament(ctx context.Context, req EnterTournamentRequestObject) (EnterTournamentResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return EnterTournament401JSONResponse{Error: "not_signed_in"}, nil
	}
	if req.Body == nil {
		return EnterTournament400JSONResponse{Error: "bad_lineup", Message: ptr("Send your lineup's card ids.")}, nil
	}
	if s.tournaments == nil {
		return nil, errors.New("tournaments are not configured")
	}
	e, err := s.tournaments.Enter(ctx, user.ID, req.TournamentId, req.Body.CardIds)
	if status, code, msg, ok := lineupError(err); ok {
		switch status {
		case 400:
			return EnterTournament400JSONResponse{Error: code, Message: ptr(msg)}, nil
		case 404:
			return EnterTournament404JSONResponse{Error: code, Message: ptr(msg)}, nil
		default:
			return EnterTournament409JSONResponse{Error: code, Message: ptr(msg)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	out, err := toTournamentEntry(e)
	if err != nil {
		return nil, err
	}
	return EnterTournament200JSONResponse(out), nil
}

func (s *Server) WithdrawFromTournament(ctx context.Context, req WithdrawFromTournamentRequestObject) (WithdrawFromTournamentResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return WithdrawFromTournament401JSONResponse{Error: "not_signed_in"}, nil
	}
	if s.tournaments == nil {
		return nil, errors.New("tournaments are not configured")
	}
	err := s.tournaments.Withdraw(ctx, user.ID, req.TournamentId)
	switch {
	case errors.Is(err, tournaments.ErrNotFound):
		return WithdrawFromTournament404JSONResponse{Error: "not_found", Message: ptr("No such tournament.")}, nil
	case errors.Is(err, tournaments.ErrNoEntry):
		return WithdrawFromTournament404JSONResponse{Error: "not_entered", Message: ptr("You haven't entered this tournament.")}, nil
	case errors.Is(err, tournaments.ErrClosed):
		return WithdrawFromTournament409JSONResponse{Error: "closed", Message: ptr("Entries are closed: lineups are final.")}, nil
	case err != nil:
		return nil, err
	}
	return WithdrawFromTournament204Response{}, nil
}

func (s *Server) PreviewTournamentLineup(ctx context.Context, req PreviewTournamentLineupRequestObject) (PreviewTournamentLineupResponseObject, error) {
	user, ok := userFrom(ctx)
	if !ok {
		return PreviewTournamentLineup401JSONResponse{Error: "not_signed_in"}, nil
	}
	if req.Body == nil {
		return PreviewTournamentLineup400JSONResponse{Error: "bad_lineup", Message: ptr("Send your lineup's card ids.")}, nil
	}
	if s.tournaments == nil {
		return nil, errors.New("tournaments are not configured")
	}
	score, err := s.tournaments.Preview(ctx, user.ID, req.TournamentId, req.Body.CardIds)
	if status, code, msg, ok := lineupError(err); ok {
		switch status {
		case 400:
			return PreviewTournamentLineup400JSONResponse{Error: code, Message: ptr(msg)}, nil
		case 404:
			return PreviewTournamentLineup404JSONResponse{Error: code, Message: ptr(msg)}, nil
		default:
			return PreviewTournamentLineup409JSONResponse{Error: code, Message: ptr(msg)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return PreviewTournamentLineup200JSONResponse(toLineupScore(score)), nil
}

// lineupError maps an enter/preview error to its HTTP status and API code.
func lineupError(err error) (status int, code, message string, ok bool) {
	switch {
	case err == nil:
		return 0, "", "", false
	case errors.Is(err, tournaments.ErrNotFound):
		return 404, "not_found", "No such tournament.", true
	case errors.Is(err, game.ErrLineupSize), errors.Is(err, game.ErrLineupDuplicate):
		return 400, "bad_lineup", "Pick 1 card up to the lineup's slots, each card once.", true
	case errors.Is(err, game.ErrLineupRarity):
		return 400, "rarity_cap", "This tournament caps the rarity of the cards you can enter.", true
	case errors.Is(err, game.ErrLineupSpirit):
		return 400, "same_spirit", "Only one card of each spirit in this tournament.", true
	case errors.Is(err, tournaments.ErrClosed):
		return 409, "closed", "Entries are closed: lineups are final.", true
	case errors.Is(err, tournaments.ErrNotOwned):
		return 409, "not_owned", "One of these cards isn't yours any more. Pick again.", true
	case errors.Is(err, tournaments.ErrInTrade):
		return 409, "in_trade", "One of these cards is offered in a trade. Cancel the offer to enter it.", true
	case errors.Is(err, tournaments.ErrInTournament):
		return 409, "in_tournament", "One of these cards is in another tournament until it ends.", true
	case errors.Is(err, tournaments.ErrCooldown):
		return 409, "cooldown", "One of these cards played in the last tournament of this series. It sits this one out.", true
	case errors.Is(err, game.ErrLineupTradedLate):
		return 409, "traded_late", "Cards traded after the tournament opened can't enter it.", true
	}
	return 0, "", "", false
}

func toTournament(t tournaments.Tournament) Tournament {
	f := t.Format
	out := Tournament{
		Id:       t.ID,
		Series:   t.Series,
		Name:     t.Name,
		Status:   TournamentStatus(t.Status),
		OpensAt:  t.OpensAt.UTC(),
		ClosesAt: t.ClosesAt.UTC(),
		EndsAt:   t.EndsAt.UTC(),
		Entries:  t.Entries,
		Entered:  t.Entered,
		Prizes:   append([]int{}, t.Prizes...),
		Format: TournamentFormat{
			Id:           f.ID,
			Kind:         TournamentFormatKind(f.Kind),
			Name:         f.Name,
			Slots:        f.Slots,
			OnePerSpirit: f.OnePerSpirit,
		},
	}
	if t.Element != "" {
		out.Element = ptr(Element(t.Element))
	}
	if t.SeedHash != "" {
		out.SeedHash = ptr(t.SeedHash)
	}
	if t.Seed != nil {
		out.Seed = ptr(hex.EncodeToString(t.Seed))
	}
	switch f.Kind {
	case game.FormatElementTrial:
		out.Format.ElementMultiplier = ptr(float32(f.ElementMultiplier))
	case game.FormatRarityCap:
		out.Format.MaxRarity = ptr(Rarity(f.MaxRarity))
		out.Format.AllowAbove = ptr(f.AllowAbove)
	case game.FormatUnderdog:
		base := map[string]float32{}
		for r, v := range f.RarityBase {
			base[string(r)] = float32(v)
		}
		out.Format.RarityBase = &base
	case game.FormatHarmony:
		out.Format.HarmonyBonusPercent = ptr(f.HarmonyBonusPercent)
	}
	return out
}

func toTournamentEntry(e tournaments.Entry) (TournamentEntry, error) {
	out := TournamentEntry{Cards: []TournamentEntryCard{}, Score: toLineupScore(e.Score)}
	if e.Rank > 0 {
		out.Rank = ptr(e.Rank)
	}
	for _, c := range e.Cards {
		item := TournamentEntryCard{CardId: c.CardID}
		if c.Card != nil {
			card, err := toCard(*c.Card)
			if err != nil {
				return TournamentEntry{}, fmt.Errorf("entry card: %w", err)
			}
			item.Card = &card
		}
		out.Cards = append(out.Cards, item)
	}
	return out, nil
}

func toLineupScore(s game.LineupScore) LineupScore {
	out := LineupScore{Cards: []LineupCardPoints{}, BonusPercent: s.BonusPercent, Bonus: s.Bonus, Total: s.Total}
	for _, c := range s.Cards {
		out.Cards = append(out.Cards, LineupCardPoints{CardId: uuid.MustParse(c.CardID), Multiplier: float32(c.Multiplier), Points: c.Points})
	}
	return out
}
